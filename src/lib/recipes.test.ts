import { describe, expect, it } from 'vitest';
import {
  createStore,
  deserializeRecipes,
  duplicateRecipe,
  ingredientsToLines,
  newRecipeId,
  parseIngredientLines,
  parseSteps,
  scaleIngredients,
  serializeRecipes,
  sortRecipes,
  validateRecipe,
  type Recipe,
} from './recipes';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r-test',
    name: '肉じゃが',
    servings: 2,
    ingredients: [
      { name: 'じゃがいも', amount: '3個' },
      { name: '豚こま切れ肉', amount: '200g' },
      { name: '醤油', amount: '大さじ2' },
      { name: '塩', amount: '少々' },
    ],
    steps: ['切る', '煮る'],
    memo: '',
    updatedAt: 1,
    ...overrides,
  };
}

describe('parseIngredientLines', () => {
  it('「材料名 分量」の行を分解する', () => {
    const text = 'じゃがいも 3個\n豚こま切れ肉 200g\n醤油 大さじ2';
    expect(parseIngredientLines(text)).toEqual([
      { name: 'じゃがいも', amount: '3個' },
      { name: '豚こま切れ肉', amount: '200g' },
      { name: '醤油', amount: '大さじ2' },
    ]);
  });

  it('全角空白でも分解でき、最後の空白で切る', () => {
    expect(parseIngredientLines('カットトマト缶 1缶')).toEqual([
      { name: 'カットトマト缶', amount: '1缶' },
    ]);
    expect(parseIngredientLines('鶏もも肉 から揚げ用 300g')).toEqual([
      { name: '鶏もも肉 から揚げ用', amount: '300g' },
    ]);
  });

  it('分量のない行は適量扱い、空行は読み飛ばす', () => {
    expect(parseIngredientLines('塩こしょう\n\nパセリ')).toEqual([
      { name: '塩こしょう', amount: '適量' },
      { name: 'パセリ', amount: '適量' },
    ]);
  });
});

describe('ingredientsToLines', () => {
  it('parseIngredientLinesと往復できる', () => {
    const lines = 'じゃがいも 3個\n塩 少々';
    expect(ingredientsToLines(parseIngredientLines(lines))).toBe(lines);
  });
});

describe('parseSteps', () => {
  it('行ごとに手順を取り、行頭の番号は落とす', () => {
    expect(parseSteps('1. 切る\n2、煮る\n\n3) 盛る')).toEqual(['切る', '煮る', '盛る']);
  });
});

describe('validateRecipe', () => {
  it('妥当なレシピは空配列', () => {
    expect(validateRecipe(recipe())).toEqual([]);
  });

  it('名前・人数・材料の不備を report する', () => {
    expect(validateRecipe(recipe({ name: ' ' }))).toHaveLength(1);
    expect(validateRecipe(recipe({ servings: 0 }))).toHaveLength(1);
    expect(validateRecipe(recipe({ servings: 2.5 }))).toHaveLength(1);
    expect(validateRecipe(recipe({ ingredients: [] }))).toHaveLength(1);
  });

  it('写真URLは空・http(s)を許し、それ以外を弾く', () => {
    expect(validateRecipe(recipe({ image: '' }))).toEqual([]);
    expect(validateRecipe(recipe({ image: 'https://images.unsplash.com/p' }))).toEqual([]);
    expect(validateRecipe(recipe({ image: 'javascript:alert(1)' }))).toHaveLength(1);
    expect(validateRecipe(recipe({ image: 'photo.jpg' }))).toHaveLength(1);
  });
});

describe('scaleIngredients', () => {
  it('人数に合わせて分量を換算する', () => {
    expect(scaleIngredients(recipe(), 4)).toEqual([
      { name: 'じゃがいも', amount: '6個' },
      { name: '豚こま切れ肉', amount: '400g' },
      { name: '醤油', amount: '大さじ4' },
      { name: '塩', amount: '少々' },
    ]);
  });

  it('同じ人数なら元の配列を返す', () => {
    const r = recipe();
    expect(scaleIngredients(r, 2)).toBe(r.ingredients);
  });
});

describe('serialize / deserialize', () => {
  it('往復しても内容が変わらない', () => {
    const recipes = [recipe(), recipe({ id: 'r-2', name: 'カレー' })];
    expect(deserializeRecipes(serializeRecipes(recipes))).toEqual(recipes);
  });

  it('壊れたJSONと形の崩れた要素を読み飛ばす', () => {
    expect(deserializeRecipes('{oops')).toEqual([]);
    const ok = recipe();
    const json = JSON.stringify([ok, { id: 'x', name: '' }, 42]);
    expect(deserializeRecipes(json)).toEqual([ok]);
  });

  it('写真つきは往復し、image欄が無い旧データも読める', () => {
    const withImage = recipe({ image: 'https://images.unsplash.com/p' });
    expect(deserializeRecipes(serializeRecipes([withImage]))).toEqual([withImage]);
    // image を後から足したので、古い保存データ(image無し)も妥当として読む
    const legacy = recipe();
    delete (legacy as { image?: string }).image;
    expect(deserializeRecipes(JSON.stringify([legacy]))).toEqual([legacy]);
  });

  it('imageが文字列でない要素は読み飛ばす', () => {
    const bad = { ...recipe(), image: 123 };
    expect(deserializeRecipes(JSON.stringify([bad]))).toEqual([]);
  });
});

describe('createStore', () => {
  it('未保存はnull、保存後は内容を返す', () => {
    const backing = new Map<string, string>();
    const store = createStore({
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => void backing.set(k, v),
    });
    expect(store.load()).toBeNull();
    store.save([]);
    expect(store.load()).toEqual([]);
    const recipes = [recipe()];
    store.save(recipes);
    expect(store.load()).toEqual(recipes);
  });
});

describe('newRecipeId', () => {
  it('呼ぶたびに違うIDを返す', () => {
    expect(newRecipeId()).not.toBe(newRecipeId());
  });
});

describe('sortRecipes', () => {
  const a = recipe({
    id: 'a',
    name: 'カレー',
    updatedAt: 300,
    ingredients: [{ name: 'x', amount: '1' }],
  });
  const b = recipe({
    id: 'b',
    name: 'あんかけ',
    updatedAt: 100,
    ingredients: [
      { name: 'x', amount: '1' },
      { name: 'y', amount: '2' },
    ],
  });
  const c = recipe({ id: 'c', name: 'さば味噌', updatedAt: 200, ingredients: [] });

  it('新しい順は更新日時の降順', () => {
    expect(sortRecipes([b, a, c], 'updated').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('名前順はかなの照合順', () => {
    expect(sortRecipes([a, b, c], 'name').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('材料順は品数の少ない順', () => {
    expect(sortRecipes([a, b, c], 'ingredients').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('元の配列を書き換えない', () => {
    const input = [b, a, c];
    sortRecipes(input, 'name');
    expect(input.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('duplicateRecipe', () => {
  it('新しいIDと「(コピー)」名、指定時刻を持つ', () => {
    const original = recipe({ id: 'orig', name: '肉じゃが' });
    const copy = duplicateRecipe(original, 999);
    expect(copy.id).not.toBe('orig');
    expect(copy.name).toBe('肉じゃが (コピー)');
    expect(copy.updatedAt).toBe(999);
  });

  it('材料・手順は別配列で、複製を触っても元が変わらない', () => {
    const original = recipe();
    const copy = duplicateRecipe(original);
    copy.ingredients[0]!.name = '別物';
    copy.steps.push('追加');
    expect(original.ingredients[0]?.name).toBe('じゃがいも');
    expect(original.steps).toHaveLength(2);
  });

  it('写真URLは引き継ぐ', () => {
    const copy = duplicateRecipe(recipe({ image: 'https://images.unsplash.com/p' }));
    expect(copy.image).toBe('https://images.unsplash.com/p');
  });
});
