// 画面の描画と遷移。状態は「レシピ台帳」「現在のルート」「買い物かご」に絞り、
// 変更のたびに現在のビューを丸ごと描き直す。フォーカスはidを頼りに復元する。

import {
  ingredientsToLines,
  MAX_SERVINGS,
  newRecipeId,
  parseIngredientLines,
  parseSteps,
  scaleIngredients,
  validateRecipe,
  type Recipe,
  type RecipeStore,
} from './lib/recipes';
import { buildShoppingList, shoppingListMarkdown, type ShoppingSelection } from './lib/shopping';
import { parseRoute, routeHash, type Route } from './lib/route';
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

/** 編集フォームの入力値。検証に失敗したとき入力を失わないために持ち回る */
interface Draft {
  name: string;
  servings: string;
  ingredients: string;
  steps: string;
  memo: string;
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
  /** 買い物かご。レシピid -> 作る人数 */
  const cart = new Map<string, number>();
  /** 詳細画面で換算中の人数。画面を離れるとレシピ本来の人数に戻る */
  let viewServings: number | null = null;
  /** 削除ボタンの二度押し確認。誤操作で消えないようにする */
  let confirmingDelete = false;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  let draft: Draft | null = null;
  let draftErrors: string[] = [];
  let copied = false;

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
    render();
  });

  // ---- 部品 ----

  function header(): string {
    const onShopping = route.view === 'shopping';
    const count = cart.size > 0 ? `<span class="cart-count">${cart.size}</span>` : '';
    return `
      <header class="site-header">
        <div class="site-header-inner">
          <a class="brand" href="#/">${icons.logo}<span>daidokoro</span></a>
          <nav aria-label="主要">
            <a href="#/" ${onShopping ? '' : 'aria-current="page"'}>レシピ</a>
            <a href="#/shopping" ${onShopping ? 'aria-current="page"' : ''}>買い物リスト${count}</a>
          </nav>
        </div>
      </header>`;
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
    const hits =
      q === ''
        ? recipes
        : recipes.filter(
            (r) => r.name.includes(q) || r.ingredients.some((i) => i.name.includes(q)),
          );
    return [...hits].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function listResults(): string {
    const hits = filteredRecipes();
    if (hits.length === 0) {
      const message =
        searchQuery.trim() === ''
          ? 'レシピがまだありません。「新しいレシピ」から登録してください。'
          : `「${esc(searchQuery.trim())}」に当てはまるレシピがありません。`;
      return `<p class="empty">${message}</p>`;
    }
    const cards = hits
      .map((r, i) => {
        const names = r.ingredients.map((ing) => ing.name);
        const preview = names.slice(0, 4).join('、') + (names.length > 4 ? ' ほか' : '');
        return `
          <li class="card" style="--i:${i}">
            <a href="${routeHash({ view: 'detail', id: r.id })}">
              <h2>${esc(r.name)}</h2>
              <p class="card-meta">${r.servings}人前・材料${r.ingredients.length}品</p>
              <p class="card-preview">${esc(preview)}</p>
            </a>
          </li>`;
      })
      .join('');
    return `<ul class="cards">${cards}</ul>`;
  }

  function listView(): string {
    return `
      <section class="view">
        <div class="toolbar">
          <label class="search">
            ${icons.search}
            <input type="search" id="search" placeholder="レシピ名・材料で探す"
              value="${esc(searchQuery)}" aria-label="レシピを検索" />
          </label>
          <a class="button primary" href="#/new">${icons.plus}<span>新しいレシピ</span></a>
        </div>
        <div id="results">${listResults()}</div>
      </section>`;
  }

  function bindListView(): void {
    const input = root.querySelector<HTMLInputElement>('#search');
    const results = root.querySelector<HTMLElement>('#results');
    input?.addEventListener('input', () => {
      searchQuery = input.value;
      if (results) results.innerHTML = listResults();
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
    return `
      <article class="view">
        <a class="back" href="#/">${icons.back}<span>一覧へ戻る</span></a>
        <div class="detail-head">
          <h1>${esc(recipe.name)}</h1>
          <div class="detail-actions">
            <a class="button" href="${routeHash({ view: 'edit', id: recipe.id })}">
              ${icons.pencil}<span>編集</span></a>
            <button type="button" class="button danger ${confirmingDelete ? 'confirming' : ''}"
              id="delete">${icons.trash}<span>${deleteLabel}</span></button>
          </div>
        </div>
        <p class="meta">${formatDate(recipe.updatedAt)} 更新</p>
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
    if (!recipe) return { name: '', servings: '2', ingredients: '', steps: '', memo: '' };
    return {
      name: recipe.name,
      servings: String(recipe.servings),
      ingredients: ingredientsToLines(recipe.ingredients),
      steps: recipe.steps.join('\n'),
      memo: recipe.memo,
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
        <div class="form-actions">
          <button type="submit" class="button primary">${icons.check}<span>保存</span></button>
          <a class="button" href="${backTarget}">キャンセル</a>
        </div>
      </form>`;
  }

  function bindEditView(recipe: Recipe | null): void {
    const form = root.querySelector<HTMLFormElement>('#recipe-form');
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
      };
      const servings = Number(draft.servings);
      const candidate = {
        name: draft.name,
        servings,
        ingredients: parseIngredientLines(draft.ingredients),
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
    const items = buildShoppingList(currentSelections());
    const list =
      items.length === 0
        ? '<p class="empty">作るレシピを選ぶと、材料をまとめてここに出します。</p>'
        : `
          <table class="shopping"><tbody>
            ${items
              .map(
                (item, i) => `
                  <tr style="--i:${i}">
                    <th scope="row">${esc(item.name)}</th>
                    <td class="amount">${esc(item.amount)}</td>
                    <td class="used-by">${esc(item.usedBy.join('、'))}</td>
                  </tr>`,
              )
              .join('')}
          </tbody></table>
          <div class="list-actions">
            <button type="button" class="button" id="copy-md">
              ${copied ? icons.check : icons.copy}<span>${copied ? 'コピーしました' : 'Markdownをコピー'}</span>
            </button>
            <button type="button" class="button" id="download-md">
              ${icons.download}<span>Markdownを保存</span>
            </button>
          </div>`;
    return `
      <section class="view">
        <h1>買い物リスト</h1>
        <p class="lede">作るレシピと人数を選ぶと、複数レシピの材料を名寄せして合算します。</p>
        <section class="panel">
          <h2>作るレシピ</h2>
          <ul class="picks">${picks}</ul>
        </section>
        <section class="panel">
          <h2>必要な材料</h2>
          ${list}
        </section>
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
    root.querySelector('#copy-md')?.addEventListener('click', () => {
      const markdown = shoppingListMarkdown(buildShoppingList(currentSelections()));
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
      const markdown = shoppingListMarkdown(buildShoppingList(currentSelections()));
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
    root.innerHTML = `
      ${header()}
      <main class="site-main">${body}</main>
      <footer class="site-footer">
        <p>daidokoro — レシピと買い物リスト。データはこの端末のブラウザにだけ保存されます。</p>
      </footer>`;
    bind();
    if (activeId !== '') document.getElementById(activeId)?.focus();
  }

  render();
}
