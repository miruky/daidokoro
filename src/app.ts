// 画面の描画と遷移。状態は「レシピ台帳」「現在のルート」「買い物かご」に絞り、
// 変更のたびに現在のビューを丸ごと描き直す。フォーカスはidを頼りに復元する。

import {
  allTags,
  duplicateRecipe,
  filterByTag,
  ingredientsToLines,
  MAX_SERVINGS,
  newRecipeId,
  parseIngredientLines,
  parseSteps,
  parseTags,
  scaleIngredients,
  sortRecipes,
  tagsToText,
  validateRecipe,
  type Recipe,
  type RecipeStore,
  type SortKey,
} from './lib/recipes';
import {
  buildShoppingList,
  countRemaining,
  partitionPantry,
  shoppingListMarkdown,
  type ShoppingItem,
  type ShoppingSelection,
} from './lib/shopping';
import { parseRoute, routeHash, type Route } from './lib/route';
import { imageSrcset, imageVariant, isSafeImageUrl } from './lib/image';
import { exportBackup, mergeRecipes, parseBackup } from './lib/backup';
import { loadChecked, saveChecked } from './lib/checklist';
import { loadPantry, savePantry } from './lib/pantry';
import { isPrefixKey, resolveShortcut } from './lib/keyboard';
import { icons } from './icons';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface ImageOpts {
  /** 横/縦の比 */
  aspect: number;
  /** sizes 属性。表示実寸をブラウザへ伝える */
  sizes: string;
  /** srcset に並べる候補幅。最大値を src の既定にする */
  widths: number[];
}

/**
 * 安全なURLを持つ画像だけを <img> にする。読み込み完了で is-loaded が付き、
 * CSSでふわっと出す。寸法属性でアスペクト比を確保しレイアウトのずれを防ぐ。
 */
function imageTag(url: string, alt: string, opts: ImageOpts): string {
  const max = Math.max(...opts.widths);
  const src = imageVariant(url, { width: max, aspect: opts.aspect });
  const srcset = imageSrcset(url, opts.widths, opts.aspect);
  const height = Math.round(max / opts.aspect);
  return (
    `<img class="ph" src="${esc(src)}" srcset="${esc(srcset)}" sizes="${esc(opts.sizes)}" ` +
    `alt="${esc(alt)}" loading="lazy" decoding="async" width="${max}" height="${height}" ` +
    `onload="this.classList.add('is-loaded')" />`
  );
}

/** 写真の無いレシピ用。線画の器を淡く置いて一覧のリズムを保つ */
function imagePlaceholder(aspectClass: string): string {
  return `<div class="thumb-empty ${aspectClass}" aria-hidden="true">${icons.dish}</div>`;
}

/** 編集フォームの入力値。検証に失敗したとき入力を失わないために持ち回る */
interface Draft {
  name: string;
  servings: string;
  ingredients: string;
  steps: string;
  memo: string;
  tags: string;
  image: string;
}

export interface AppDeps {
  root: HTMLElement;
  store: RecipeStore;
  initialRecipes: Recipe[];
}

export function createApp({ root, store, initialRecipes }: AppDeps): void {
  let recipes = initialRecipes;
  let route = parseRoute(location.hash);
  let searchQuery = '';
  let sortKey: SortKey = 'updated';
  /** 一覧の絞り込み中のタグ。null はすべて表示 */
  let activeTag: string | null = null;
  /** 買い物かご。レシピid -> 作る人数 */
  const cart = new Map<string, number>();
  /** 買い物リストで「買った」材料名。端末に保存して再訪でも残す */
  const checked = loadChecked(localStorage);
  /** 常備品(いつも家にある材料)。買い物リストから外す。端末に保存する */
  const pantry = loadPantry(localStorage);
  /** 詳細画面で換算中の人数。画面を離れるとレシピ本来の人数に戻る */
  let viewServings: number | null = null;
  /** 削除ボタンの二度押し確認。誤操作で消えないようにする */
  let confirmingDelete = false;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  let draft: Draft | null = null;
  let draftErrors: string[] = [];
  let copied = false;
  /** 読み込み結果の通知。一覧の下に出し、画面遷移で消す */
  let notice = '';
  /** 入場演出は画面遷移時だけ。ステッパー等の再描画では再生しない */
  let animateView = true;

  const save = (): void => store.save(recipes);
  const find = (id: string): Recipe | undefined => recipes.find((r) => r.id === id);
  const navigate = (to: Route): void => {
    location.hash = routeHash(to);
  };

  window.addEventListener('hashchange', () => {
    route = parseRoute(location.hash);
    viewServings = null;
    confirmingDelete = false;
    draft = null;
    draftErrors = [];
    copied = false;
    notice = '';
    animateView = true;
    render();
  });

  // ---- 部品 ----

  function header(): string {
    const onShopping = route.view === 'shopping';
    const count =
      cart.size > 0
        ? `<span class="cart-count" aria-label="${cart.size}品を選択中">${cart.size}</span>`
        : '';
    return `
      <header class="site-header">
        <div class="site-header-inner">
          <a class="brand" href="#/">${icons.logo}<span>daidokoro</span></a>
          <div class="header-nav">
            <nav aria-label="主要">
              <a href="#/" ${onShopping ? '' : 'aria-current="page"'}>レシピ</a>
              <a href="#/shopping" ${onShopping ? 'aria-current="page"' : ''}>買い物リスト${count}</a>
            </nav>
            <button type="button" class="icon-button" id="help-open"
              aria-label="キーボードショートカットを表示" title="ショートカット ( ? )">
              ${icons.keyboard}
            </button>
          </div>
        </div>
      </header>`;
  }

  // キーボードショートカットの一覧。? で開き、Escやボタンで閉じる。
  function helpDialog(): string {
    const rows: Array<[string, string]> = [
      ['/', '検索へ移動'],
      ['n', '新しいレシピ'],
      ['g → l', 'レシピ一覧へ'],
      ['g → s', '買い物リストへ'],
      ['?', 'このヘルプ'],
    ];
    const body = rows
      .map(
        ([keys, label]) => `
          <div class="shortcut">
            <dt>${keys
              .split(' → ')
              .map((k) => `<kbd>${esc(k)}</kbd>`)
              .join('<span class="then">そのあと</span>')}</dt>
            <dd>${esc(label)}</dd>
          </div>`,
      )
      .join('');
    return `
      <dialog id="help-dialog" class="help-dialog" aria-labelledby="help-title">
        <form method="dialog">
          <h2 id="help-title">キーボードショートカット</h2>
          <dl class="shortcut-list">${body}</dl>
          <button type="submit" class="button" value="close">閉じる</button>
        </form>
      </dialog>`;
  }

  // 一覧の頭に置く全幅のヒーロー。仕込み中の俎板の写真にタイトルを重ねる。
  function masthead(): string {
    const hero = 'https://images.unsplash.com/photo-1466637574441-749b8f19452f';
    return `
      <section class="masthead" aria-labelledby="masthead-title">
        <div class="masthead-media">${imageTag(hero, '', {
          aspect: 2.4,
          sizes: '100vw',
          widths: [900, 1400, 1960],
        })}</div>
        <div class="masthead-inner">
          <p class="kicker">Recipe notebook</p>
          <h1 id="masthead-title">台所の手控え</h1>
          <p class="masthead-lede">
            作るものを書き留め、人数に合わせて分量を換算し、複数のレシピの材料を名寄せして買い物リストにまとめます。
          </p>
        </div>
      </section>`;
  }

  function stepper(opts: {
    idPrefix: string;
    value: number;
    label: string;
    disabled?: boolean;
  }): string {
    const { idPrefix, value, label, disabled = false } = opts;
    return `
      <div class="stepper" role="group" aria-label="${esc(label)}">
        <button type="button" id="${idPrefix}-dec" aria-label="人数を減らす"
          ${disabled || value <= 1 ? 'disabled' : ''}>${icons.minus}</button>
        <span class="stepper-value" aria-live="polite"><strong>${value}</strong>人前</span>
        <button type="button" id="${idPrefix}-inc" aria-label="人数を増やす"
          ${disabled || value >= MAX_SERVINGS ? 'disabled' : ''}>${icons.plus}</button>
      </div>`;
  }

  // ---- 一覧 ----

  function filteredRecipes(): Recipe[] {
    const q = searchQuery.trim();
    let hits =
      q === ''
        ? recipes
        : recipes.filter(
            (r) => r.name.includes(q) || r.ingredients.some((i) => i.name.includes(q)),
          );
    if (activeTag !== null) hits = filterByTag(hits, activeTag);
    return sortRecipes(hits, sortKey);
  }

  function listResults(): string {
    const hits = filteredRecipes();
    if (hits.length === 0) {
      const q = searchQuery.trim();
      if (q === '' && activeTag === null) {
        return `
          <div class="empty-state">
            ${icons.dish}
            <p>レシピがまだありません。上の「新しいレシピ」から書き留めるか、<br />書き出したファイルを下の「読み込む」から取り込めます。</p>
          </div>`;
      }
      const terms = [activeTag, q].filter((t) => t !== null && t !== '').map((t) => `「${esc(t as string)}」`);
      return `<p class="empty">${terms.join('と')}に当てはまるレシピがありません。</p>`;
    }
    const cards = hits
      .map((r, i) => {
        const names = r.ingredients.map((ing) => ing.name);
        const preview = names.slice(0, 4).join('、') + (names.length > 4 ? ' ほか' : '');
        const media =
          r.image && isSafeImageUrl(r.image)
            ? imageTag(r.image, '', {
                aspect: 1,
                sizes: '(max-width: 560px) 76px, 104px',
                widths: [152, 304],
              })
            : imagePlaceholder('thumb-sq');
        return `
          <li class="card" style="--i:${i}">
            <a href="${routeHash({ view: 'detail', id: r.id })}">
              <div class="card-media">${media}</div>
              <div class="card-body">
                <h2><span>${esc(r.name)}</span></h2>
                <p class="card-meta">${r.servings}人前・材料${r.ingredients.length}品</p>
                <p class="card-preview">${esc(preview)}</p>
                ${
                  r.tags && r.tags.length > 0
                    ? `<ul class="card-tags">${r.tags
                        .map((t) => `<li class="tag">${esc(t)}</li>`)
                        .join('')}</ul>`
                    : ''
                }
              </div>
            </a>
          </li>`;
      })
      .join('');
    return `<ul class="cards">${cards}</ul>`;
  }

  // タグの絞り込み行。台帳にタグが無ければ何も出さない。
  function tagFilter(): string {
    const tags = allTags(recipes);
    if (tags.length === 0) return '';
    const chip = (tag: string | null, label: string, i: number): string => {
      const active = activeTag === tag;
      return `<button type="button" class="tag-chip${active ? ' active' : ''}" id="tag-${i}"
        data-tag="${tag === null ? '' : esc(tag)}" aria-pressed="${active}">${esc(label)}</button>`;
    };
    const chips = [chip(null, 'すべて', 0), ...tags.map((t, i) => chip(t, t, i + 1))].join('');
    return `<div class="tag-filter" role="group" aria-label="タグで絞り込み">${chips}</div>`;
  }

  function listView(): string {
    // 絞り込み中のタグが台帳から無くなっていたら解除する
    if (activeTag !== null && !allTags(recipes).includes(activeTag)) activeTag = null;
    return `
      <section class="view">
        <div class="toolbar">
          <label class="search">
            ${icons.search}
            <input type="search" id="search" placeholder="レシピ名・材料で探す"
              value="${esc(searchQuery)}" aria-label="レシピを検索" />
          </label>
          ${
            recipes.length > 1
              ? `<label class="sort">
            <span class="sr-only">並び替え</span>
            <select id="sort" aria-label="レシピの並び替え">
              <option value="updated"${sortKey === 'updated' ? ' selected' : ''}>新しい順</option>
              <option value="name"${sortKey === 'name' ? ' selected' : ''}>名前順</option>
              <option value="ingredients"${sortKey === 'ingredients' ? ' selected' : ''}>材料の少ない順</option>
            </select>
          </label>`
              : ''
          }
          <a class="button primary" href="#/new">${icons.plus}<span>新しいレシピ</span></a>
        </div>
        ${tagFilter()}
        <div id="results">${listResults()}</div>
        <div class="data-bar">
          <button type="button" class="link-button" id="export" ${
            recipes.length === 0 ? 'disabled' : ''
          }>${icons.download}<span>レシピを書き出す</span></button>
          <button type="button" class="link-button" id="import">
            ${icons.upload}<span>読み込む</span>
          </button>
          <input type="file" id="import-file" accept="application/json,.json"
            aria-label="バックアップJSONファイルを選択" hidden />
          ${notice ? `<span class="data-notice" role="status">${esc(notice)}</span>` : ''}
        </div>
      </section>`;
  }

  function bindListView(): void {
    const input = root.querySelector<HTMLInputElement>('#search');
    const results = root.querySelector<HTMLElement>('#results');
    input?.addEventListener('input', () => {
      searchQuery = input.value;
      if (results) results.innerHTML = listResults();
    });

    const sort = root.querySelector<HTMLSelectElement>('#sort');
    sort?.addEventListener('change', () => {
      sortKey = sort.value as SortKey;
      if (results) results.innerHTML = listResults();
    });

    // タグ絞り込み。同じタグを再度押すと解除。チップの状態も変わるので全描画する。
    for (const chip of root.querySelectorAll<HTMLButtonElement>('.tag-chip')) {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag ?? '';
        activeTag = tag === '' || activeTag === tag ? null : tag;
        render();
      });
    }

    root.querySelector('#export')?.addEventListener('click', () => {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url = URL.createObjectURL(
        new Blob([exportBackup(recipes)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `daidokoro-recipes-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const fileInput = root.querySelector<HTMLInputElement>('#import-file');
    root.querySelector('#import')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const incoming = parseBackup(typeof reader.result === 'string' ? reader.result : '');
        if (incoming.length === 0) {
          notice = '取り込めるレシピが見つかりませんでした。';
          render();
          return;
        }
        const result = mergeRecipes(recipes, incoming);
        recipes = result.recipes;
        save();
        notice = `${result.added}件を追加・${result.updated}件を更新しました。`;
        render();
      };
      reader.readAsText(file);
    });
  }

  // ---- 詳細 ----

  function detailView(recipe: Recipe): string {
    const servings = viewServings ?? recipe.servings;
    const scaled = scaleIngredients(recipe, servings);
    const inCart = cart.has(recipe.id);
    const rows = scaled
      .map(
        (i, idx) => `
          <tr style="--i:${idx}">
            <th scope="row">${esc(i.name)}</th>
            <td>${esc(i.amount)}</td>
          </tr>`,
      )
      .join('');
    const steps = recipe.steps.map((s, idx) => `<li style="--i:${idx}">${esc(s)}</li>`).join('');
    const note =
      servings !== recipe.servings
        ? `<p class="note">${recipe.servings}人前のレシピを${servings}人前に換算しています。</p>`
        : '';
    const deleteLabel = confirmingDelete ? 'もう一度押すと削除' : '削除';
    const hero =
      recipe.image && isSafeImageUrl(recipe.image)
        ? `<figure class="detail-hero">${imageTag(recipe.image, `${recipe.name}の写真`, {
            aspect: 3 / 2,
            sizes: '(max-width: 800px) 100vw, 700px',
            widths: [560, 840, 1200],
          })}</figure>`
        : '';
    return `
      <article class="view">
        <a class="back" href="#/">${icons.back}<span>一覧へ戻る</span></a>
        ${hero}
        <p class="eyebrow">${formatDate(recipe.updatedAt)} 更新</p>
        <div class="detail-head">
          <h1>${esc(recipe.name)}</h1>
          <div class="detail-actions">
            <a class="button" href="${routeHash({ view: 'edit', id: recipe.id })}">
              ${icons.pencil}<span>編集</span></a>
            <button type="button" class="button" id="duplicate">
              ${icons.copy}<span>複製</span></button>
            <button type="button" class="button" id="print-recipe">
              ${icons.print}<span>印刷</span></button>
            <button type="button" class="button danger ${confirmingDelete ? 'confirming' : ''}"
              id="delete">${icons.trash}<span>${deleteLabel}</span></button>
          </div>
        </div>
        ${
          recipe.tags && recipe.tags.length > 0
            ? `<div class="detail-tags">${recipe.tags
                .map(
                  (t) =>
                    `<button type="button" class="tag tag-link" data-detail-tag="${esc(t)}"
                      aria-label="${esc(t)}のレシピを一覧で見る">${esc(t)}</button>`,
                )
                .join('')}</div>`
            : ''
        }
        <section class="panel">
          <div class="panel-head">
            <h2>材料</h2>
            ${stepper({ idPrefix: 'serv', value: servings, label: '人数' })}
          </div>
          ${note}
          <table class="ingredients"><tbody>${rows}</tbody></table>
          <button type="button" class="button" id="add-cart" ${inCart ? 'disabled' : ''}>
            ${icons.basket}<span>${inCart ? '買い物リストに追加済み' : `${servings}人前を買い物リストへ`}</span>
          </button>
        </section>
        <section class="panel">
          <h2>作り方</h2>
          <ol class="steps">${steps}</ol>
        </section>
        ${recipe.memo ? `<section class="panel"><h2>メモ</h2><p class="memo">${esc(recipe.memo)}</p></section>` : ''}
      </article>`;
  }

  function bindDetailView(recipe: Recipe): void {
    // タグを押すと、そのタグで絞り込んだ一覧へ移る
    for (const tagButton of root.querySelectorAll<HTMLButtonElement>('button[data-detail-tag]')) {
      tagButton.addEventListener('click', () => {
        const tag = tagButton.dataset.detailTag;
        if (tag === undefined) return;
        activeTag = tag;
        navigate({ view: 'list' });
      });
    }
    const setServings = (next: number): void => {
      viewServings = Math.min(MAX_SERVINGS, Math.max(1, next));
      render();
    };
    root.querySelector('#serv-dec')?.addEventListener('click', () => {
      setServings((viewServings ?? recipe.servings) - 1);
    });
    root.querySelector('#serv-inc')?.addEventListener('click', () => {
      setServings((viewServings ?? recipe.servings) + 1);
    });
    root.querySelector('#add-cart')?.addEventListener('click', () => {
      cart.set(recipe.id, viewServings ?? recipe.servings);
      render();
    });
    root.querySelector('#duplicate')?.addEventListener('click', () => {
      const copy = duplicateRecipe(recipe);
      recipes = [copy, ...recipes];
      save();
      navigate({ view: 'edit', id: copy.id });
    });
    root.querySelector('#print-recipe')?.addEventListener('click', () => window.print());
    root.querySelector('#delete')?.addEventListener('click', () => {
      if (!confirmingDelete) {
        confirmingDelete = true;
        if (confirmTimer) clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          confirmingDelete = false;
          render();
        }, 4000);
        render();
        return;
      }
      if (confirmTimer) clearTimeout(confirmTimer);
      recipes = recipes.filter((r) => r.id !== recipe.id);
      cart.delete(recipe.id);
      save();
      navigate({ view: 'list' });
    });
  }

  // ---- 作成・編集 ----

  function draftFrom(recipe: Recipe | null): Draft {
    if (!recipe)
      return { name: '', servings: '2', ingredients: '', steps: '', memo: '', tags: '', image: '' };
    return {
      name: recipe.name,
      servings: String(recipe.servings),
      ingredients: ingredientsToLines(recipe.ingredients),
      steps: recipe.steps.join('\n'),
      memo: recipe.memo,
      tags: tagsToText(recipe.tags),
      image: recipe.image ?? '',
    };
  }

  function editView(recipe: Recipe | null): string {
    const d = draft ?? draftFrom(recipe);
    const backTarget = recipe ? routeHash({ view: 'detail', id: recipe.id }) : '#/';
    const errors =
      draftErrors.length === 0
        ? ''
        : `<div class="form-errors" role="alert" tabindex="-1"><ul>${draftErrors
            .map((e) => `<li>${esc(e)}</li>`)
            .join('')}</ul></div>`;
    return `
      <form class="view form" id="recipe-form" novalidate>
        <a class="back" href="${backTarget}">${icons.back}<span>戻る</span></a>
        <h1>${recipe ? 'レシピを編集' : '新しいレシピ'}</h1>
        ${errors}
        <div class="field-row">
          <label class="field grow">
            <span>レシピ名</span>
            <input name="name" value="${esc(d.name)}" autocomplete="off" />
          </label>
          <label class="field">
            <span>何人前</span>
            <input name="servings" type="number" inputmode="numeric"
              min="1" max="${MAX_SERVINGS}" value="${esc(d.servings)}" />
          </label>
        </div>
        <label class="field">
          <span>材料(1行に「材料名 分量」。分量を省くと「適量」)</span>
          <textarea name="ingredients" rows="10"
            placeholder="じゃがいも 3個&#10;醤油 大さじ2&#10;塩 少々">${esc(d.ingredients)}</textarea>
        </label>
        <label class="field">
          <span>作り方(1行に1手順)</span>
          <textarea name="steps" rows="7"
            placeholder="じゃがいもを乱切りにする&#10;鍋で肉を炒める">${esc(d.steps)}</textarea>
        </label>
        <label class="field">
          <span>メモ(任意)</span>
          <textarea name="memo" rows="3">${esc(d.memo)}</textarea>
        </label>
        <label class="field">
          <span>タグ(任意・カンマか空白区切り)</span>
          <input name="tags" autocomplete="off"
            placeholder="和食, 作り置き, メイン" value="${esc(d.tags)}" />
        </label>
        <label class="field">
          <span>写真URL(任意)</span>
          <input name="image" type="url" inputmode="url" autocomplete="off"
            placeholder="https://images.unsplash.com/… など" value="${esc(d.image)}" />
        </label>
        <figure class="image-preview" id="image-preview" ${
          d.image && isSafeImageUrl(d.image) ? '' : 'hidden'
        }>${
          d.image && isSafeImageUrl(d.image)
            ? imageTag(d.image, '写真プレビュー', {
                aspect: 3 / 2,
                sizes: '(max-width: 800px) 100vw, 700px',
                widths: [400, 700],
              })
            : ''
        }</figure>
        <div class="form-actions">
          <button type="submit" class="button primary">${icons.check}<span>保存</span></button>
          <a class="button" href="${backTarget}">キャンセル</a>
        </div>
      </form>`;
  }

  function bindEditView(recipe: Recipe | null): void {
    const form = root.querySelector<HTMLFormElement>('#recipe-form');
    // 写真URLを打つたびにプレビューを差し替える(安全なURLのときだけ表示)
    const imageInput = form?.querySelector<HTMLInputElement>('input[name="image"]');
    const preview = root.querySelector<HTMLElement>('#image-preview');
    imageInput?.addEventListener('input', () => {
      if (!preview) return;
      const url = imageInput.value.trim();
      const ok = url !== '' && isSafeImageUrl(url);
      preview.innerHTML = ok
        ? imageTag(url, '写真プレビュー', {
            aspect: 3 / 2,
            sizes: '(max-width: 800px) 100vw, 700px',
            widths: [400, 700],
          })
        : '';
      preview.hidden = !ok;
    });
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const read = (key: string): string => {
        const value = data.get(key);
        return typeof value === 'string' ? value : '';
      };
      draft = {
        name: read('name'),
        servings: read('servings'),
        ingredients: read('ingredients'),
        steps: read('steps'),
        memo: read('memo'),
        tags: read('tags'),
        image: read('image'),
      };
      const servings = Number(draft.servings);
      const image = draft.image.trim();
      const tags = parseTags(draft.tags);
      const candidate = {
        name: draft.name,
        servings,
        ingredients: parseIngredientLines(draft.ingredients),
        image,
      };
      draftErrors = validateRecipe(candidate);
      if (draftErrors.length > 0) {
        render();
        root.querySelector<HTMLElement>('.form-errors')?.focus();
        return;
      }
      const saved: Recipe = {
        id: recipe?.id ?? newRecipeId(),
        name: draft.name.trim(),
        servings,
        ingredients: candidate.ingredients,
        steps: parseSteps(draft.steps),
        memo: draft.memo.trim(),
        ...(tags.length > 0 ? { tags } : {}),
        ...(image !== '' ? { image } : {}),
        updatedAt: Date.now(),
      };
      recipes = recipe ? recipes.map((r) => (r.id === recipe.id ? saved : r)) : [saved, ...recipes];
      // 人数を変えた可能性があるので、かごに入っていれば新しい基準人数に合わせ直す
      if (cart.has(saved.id)) cart.set(saved.id, saved.servings);
      save();
      navigate({ view: 'detail', id: saved.id });
    });
  }

  // ---- 買い物リスト ----

  function currentSelections(): ShoppingSelection[] {
    const selections: ShoppingSelection[] = [];
    for (const recipe of recipes) {
      const servings = cart.get(recipe.id);
      if (servings !== undefined) selections.push({ recipe, servings });
    }
    return selections;
  }

  /** 常備品を除いた、実際に買う品目。コピー・保存・残数の集計はこれを使う */
  function shoppingItems(): ShoppingItem[] {
    return partitionPantry(buildShoppingList(currentSelections()), pantry).list;
  }

  function shoppingView(): string {
    if (recipes.length === 0) {
      return `
        <section class="view">
          <h1>買い物リスト</h1>
          <p class="empty">レシピがまだありません。先にレシピを登録してください。</p>
        </section>`;
    }
    const picks = recipes
      .map((r, i) => {
        const selected = cart.has(r.id);
        const servings = cart.get(r.id) ?? r.servings;
        return `
          <li class="pick ${selected ? 'selected' : ''}" style="--i:${i}">
            <label>
              <input type="checkbox" id="pick-${esc(r.id)}" data-pick="${esc(r.id)}"
                ${selected ? 'checked' : ''} />
              <span>${esc(r.name)}</span>
            </label>
            ${stepper({ idPrefix: `pick-${r.id}`, value: servings, label: `${r.name}の人数`, disabled: !selected })}
          </li>`;
      })
      .join('');
    const { list: items, stocked } = partitionPantry(
      buildShoppingList(currentSelections()),
      pantry,
    );
    const remaining = countRemaining(items, checked);
    const list =
      items.length === 0
        ? `<p class="empty">${
            stocked.length > 0
              ? '必要な材料はすべて常備品でまかなえます。'
              : '作るレシピを選ぶと、材料をまとめてここに出します。'
          }</p>`
        : `
          <table class="shopping"><tbody>
            ${items
              .map((item, i) => {
                const got = checked.has(item.name);
                return `
                  <tr class="shop-row${got ? ' got' : ''}" style="--i:${i}">
                    <td class="got-cell">
                      <input type="checkbox" class="got-box" id="got-${i}" data-item="${esc(item.name)}"
                        ${got ? 'checked' : ''} aria-label="${esc(item.name)}を買った" />
                    </td>
                    <th scope="row"><label for="got-${i}">${esc(item.name)}</label></th>
                    <td class="amount">${esc(item.amount)}</td>
                    <td class="used-by">${esc(item.usedBy.join('、'))}</td>
                    <td class="stock-cell">
                      <button type="button" class="icon-button" data-pantry="${esc(item.name)}"
                        aria-label="${esc(item.name)}を常備品にして買い物リストから外す" title="常備品にする">
                        ${icons.jar}
                      </button>
                    </td>
                  </tr>`;
              })
              .join('')}
          </tbody></table>
          <div class="list-actions">
            <button type="button" class="button" id="copy-md">
              ${copied ? icons.check : icons.copy}<span>${copied ? 'コピーしました' : 'Markdownをコピー'}</span>
            </button>
            <button type="button" class="button" id="download-md">
              ${icons.download}<span>Markdownを保存</span>
            </button>
            <button type="button" class="button" id="print-list">
              ${icons.print}<span>印刷</span>
            </button>
            ${
              [...checked].some((name) => items.some((it) => it.name === name))
                ? `<button type="button" class="link-button" id="clear-checks">買ったチェックを消す</button>`
                : ''
            }
          </div>`;
    const tally =
      items.length === 0
        ? ''
        : `<p class="shop-tally" role="status">残り ${remaining} 品 / 全 ${items.length} 品</p>`;
    const stockedSection =
      stocked.length === 0
        ? ''
        : `
          <section class="panel pantry">
            <div class="panel-head">
              <h2>常備品</h2>
              <button type="button" class="link-button" id="clear-pantry">すべて戻す</button>
            </div>
            <p class="pantry-note">いつも家にある材料として買い物リストから外しています。</p>
            <ul class="stocked">
              ${stocked
                .map(
                  (item) => `
                    <li>
                      <span class="stock-name">${esc(item.name)}</span>
                      <button type="button" class="link-button restore" data-restore="${esc(item.name)}"
                        aria-label="${esc(item.name)}を買い物リストに戻す">戻す</button>
                    </li>`,
                )
                .join('')}
            </ul>
          </section>`;
    return `
      <section class="view">
        <h1>買い物リスト</h1>
        <p class="lede">作るレシピと人数を選ぶと、複数レシピの材料を名寄せして合算します。</p>
        <section class="panel">
          <h2>作るレシピ</h2>
          <ul class="picks">${picks}</ul>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>必要な材料</h2>
            ${tally}
          </div>
          ${list}
        </section>
        ${stockedSection}
      </section>`;
  }

  function bindShoppingView(): void {
    for (const box of root.querySelectorAll<HTMLInputElement>('input[data-pick]')) {
      box.addEventListener('change', () => {
        const id = box.dataset.pick;
        const recipe = id !== undefined ? find(id) : undefined;
        if (!recipe) return;
        if (box.checked) cart.set(recipe.id, cart.get(recipe.id) ?? recipe.servings);
        else cart.delete(recipe.id);
        render();
      });
    }
    for (const recipe of recipes) {
      const change = (delta: number) => () => {
        const current = cart.get(recipe.id);
        if (current === undefined) return;
        cart.set(recipe.id, Math.min(MAX_SERVINGS, Math.max(1, current + delta)));
        render();
      };
      root.querySelector(`[id="pick-${recipe.id}-dec"]`)?.addEventListener('click', change(-1));
      root.querySelector(`[id="pick-${recipe.id}-inc"]`)?.addEventListener('click', change(1));
    }
    // 「買った」チェックは全描画せず、その行のクラスと残数だけ更新して保存する。
    for (const box of root.querySelectorAll<HTMLInputElement>('input.got-box')) {
      box.addEventListener('change', () => {
        const name = box.dataset.item;
        if (name === undefined) return;
        if (box.checked) checked.add(name);
        else checked.delete(name);
        saveChecked(localStorage, checked);
        box.closest('.shop-row')?.classList.toggle('got', box.checked);
        const items = shoppingItems();
        const tally = root.querySelector('.shop-tally');
        if (tally)
          tally.textContent = `残り ${countRemaining(items, checked)} 品 / 全 ${items.length} 品`;
      });
    }
    // 常備品にする(リストから外す)/ 戻す。集合を保存して全描画し直す。
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-pantry]')) {
      button.addEventListener('click', () => {
        const name = button.dataset.pantry;
        if (name === undefined) return;
        pantry.add(name);
        savePantry(localStorage, pantry);
        render();
      });
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-restore]')) {
      button.addEventListener('click', () => {
        const name = button.dataset.restore;
        if (name === undefined) return;
        pantry.delete(name);
        savePantry(localStorage, pantry);
        render();
      });
    }
    root.querySelector('#clear-pantry')?.addEventListener('click', () => {
      pantry.clear();
      savePantry(localStorage, pantry);
      render();
    });
    root.querySelector('#clear-checks')?.addEventListener('click', () => {
      checked.clear();
      saveChecked(localStorage, checked);
      render();
    });
    root.querySelector('#print-list')?.addEventListener('click', () => window.print());
    root.querySelector('#copy-md')?.addEventListener('click', () => {
      const markdown = shoppingListMarkdown(shoppingItems(), '買い物リスト', checked);
      void navigator.clipboard.writeText(markdown).then(() => {
        copied = true;
        render();
        setTimeout(() => {
          copied = false;
          render();
        }, 2000);
      });
    });
    root.querySelector('#download-md')?.addEventListener('click', () => {
      const markdown = shoppingListMarkdown(shoppingItems(), '買い物リスト', checked);
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kaimono-list.md';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ---- 描画 ----

  function notFoundView(): string {
    return `
      <section class="view">
        <h1>レシピが見つかりません</h1>
        <p class="empty">削除されたか、URLが違う可能性があります。</p>
        <a class="button" href="#/">${icons.back}<span>一覧へ戻る</span></a>
      </section>`;
  }

  function render(): void {
    const activeId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
    let body: string;
    let bind: () => void = () => {};
    switch (route.view) {
      case 'list':
        body = listView();
        bind = bindListView;
        break;
      case 'new':
        body = editView(null);
        bind = () => bindEditView(null);
        break;
      case 'detail':
      case 'edit': {
        const recipe = find(route.id);
        if (!recipe) {
          body = notFoundView();
          break;
        }
        if (route.view === 'detail') {
          body = detailView(recipe);
          bind = () => bindDetailView(recipe);
        } else {
          body = editView(recipe);
          bind = () => bindEditView(recipe);
        }
        break;
      }
      case 'shopping':
        body = shoppingView();
        bind = bindShoppingView;
        break;
    }
    const entering = animateView;
    animateView = false;
    root.innerHTML = `
      ${header()}
      <div class="page${entering ? ' is-enter' : ''}">
        ${route.view === 'list' ? masthead() : ''}
        <main class="site-main">${body}</main>
      </div>
      <footer class="site-footer">
        <p>daidokoro — レシピと買い物リスト。データはこの端末のブラウザにだけ保存されます。</p>
      </footer>
      ${helpDialog()}`;
    bind();
    root.querySelector('#help-open')?.addEventListener('click', openHelp);
    // キャッシュ済みで onload が発火しない画像も、表示状態に揃える
    for (const img of root.querySelectorAll<HTMLImageElement>('img.ph')) {
      if (img.complete) img.classList.add('is-loaded');
    }
    // 入場演出が終わったら印を外し、検索など部分更新で再生されないようにする
    if (entering) {
      const page = root.querySelector('.page');
      window.setTimeout(() => page?.classList.remove('is-enter'), 850);
    }
    // 部分更新は操作中の要素へフォーカスを戻す。画面遷移では見出しへ移し、
    // 読み上げに切り替わりを伝える(スクロールは動かさない)。
    const active = activeId !== '' ? document.getElementById(activeId) : null;
    if (active) {
      active.focus({ preventScroll: true });
    } else if (entering) {
      const heading = root.querySelector<HTMLElement>('.page h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }

  function openHelp(): void {
    const dialog = root.querySelector<HTMLDialogElement>('#help-dialog');
    if (dialog && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  }

  // 検索へ移動。一覧以外にいれば一覧へ遷移してから入力欄にフォーカスする。
  function focusSearch(): void {
    const input = root.querySelector<HTMLInputElement>('#search');
    if (input) {
      input.focus();
      input.select();
      return;
    }
    navigate({ view: 'list' });
    window.setTimeout(() => {
      const next = root.querySelector<HTMLInputElement>('#search');
      next?.focus();
    }, 0);
  }

  // ---- キーボードショートカット ----
  // g に続けて押すキーを待つため、前置状態を短時間だけ保持する。
  let pendingG = false;
  let gTimer: ReturnType<typeof setTimeout> | null = null;
  const clearPending = (): void => {
    pendingG = false;
    if (gTimer) {
      clearTimeout(gTimer);
      gTimer = null;
    }
  };
  document.addEventListener('keydown', (e) => {
    // ダイアログ表示中はネイティブのEsc閉じだけに任せ、他のキーは拾わない
    if (root.querySelector('dialog[open]')) return;
    const target = e.target;
    const typing =
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if (isPrefixKey(e.key, typing) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      pendingG = true;
      if (gTimer) clearTimeout(gTimer);
      gTimer = setTimeout(clearPending, 1200);
      return;
    }

    const shortcut = resolveShortcut({
      key: e.key,
      pendingG,
      typing,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      alt: e.altKey,
    });
    clearPending();
    if (!shortcut) return;
    e.preventDefault();
    switch (shortcut.type) {
      case 'focus-search':
        focusSearch();
        break;
      case 'new-recipe':
        navigate({ view: 'new' });
        break;
      case 'go-list':
        navigate({ view: 'list' });
        break;
      case 'go-shopping':
        navigate({ view: 'shopping' });
        break;
      case 'help':
        openHelp();
        break;
    }
  });

  // mastheadの軽い視差。スクロール量の一部だけ画像を遅らせて層をつくる。
  // reduced-motion では一切動かさない。rAFで間引いてスクロールを重くしない。
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let parallaxQueued = false;
  const applyParallax = (): void => {
    parallaxQueued = false;
    const media = root.querySelector<HTMLElement>('.masthead-media');
    if (media) {
      media.style.transform = `translate3d(0, ${Math.min(window.scrollY * 0.2, 64)}px, 0)`;
    }
  };
  window.addEventListener(
    'scroll',
    () => {
      if (reduceMotion.matches || parallaxQueued) return;
      parallaxQueued = true;
      requestAnimationFrame(applyParallax);
    },
    { passive: true },
  );

  render();
}
