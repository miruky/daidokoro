import { describe, expect, it } from 'vitest';
import { buildShoppingList, countRemaining, shoppingListMarkdown } from './shopping';
import type { Recipe } from './recipes';

function recipe(name: string, ingredients: Array<[string, string]>, servings = 2): Recipe {
  return {
    id: `r-${name}`,
    name,
    servings,
    ingredients: ingredients.map(([n, amount]) => ({ name: n, amount })),
    steps: [],
    memo: '',
    updatedAt: 1,
  };
}

describe('buildShoppingList', () => {
  it('同じ材料・同じ単位を合算する', () => {
    const a = recipe('肉じゃが', [
      ['玉ねぎ', '1個'],
      ['豚こま切れ肉', '200g'],
    ]);
    const b = recipe('豚汁', [
      ['玉ねぎ', '1/2個'],
      ['豚こま切れ肉', '100g'],
    ]);
    const items = buildShoppingList([
      { recipe: a, servings: 2 },
      { recipe: b, servings: 2 },
    ]);
    expect(items).toEqual([
      { name: '玉ねぎ', amount: '1と1/2個', usedBy: ['肉じゃが', '豚汁'] },
      { name: '豚こま切れ肉', amount: '300g', usedBy: ['肉じゃが', '豚汁'] },
    ]);
  });

  it('人数換算してから合算する', () => {
    const a = recipe('カレー', [['じゃがいも', '2個']], 2);
    const items = buildShoppingList([{ recipe: a, servings: 4 }]);
    expect(items).toEqual([{ name: 'じゃがいも', amount: '4個', usedBy: ['カレー'] }]);
  });

  it('単位が違うものは併記し、適量は重複なくまとめる', () => {
    const a = recipe('A', [
      ['生姜', '1片'],
      ['塩', '少々'],
    ]);
    const b = recipe('B', [
      ['生姜', '10g'],
      ['塩', '少々'],
    ]);
    const items = buildShoppingList([
      { recipe: a, servings: 2 },
      { recipe: b, servings: 2 },
    ]);
    expect(items).toEqual([
      { name: '生姜', amount: '1片 + 10g', usedBy: ['A', 'B'] },
      { name: '塩', amount: '少々', usedBy: ['A', 'B'] },
    ]);
  });

  it('数値と適量が混ざれば両方を書く', () => {
    const a = recipe('A', [['醤油', '大さじ2']]);
    const b = recipe('B', [['醤油', '適量']]);
    const items = buildShoppingList([
      { recipe: a, servings: 2 },
      { recipe: b, servings: 2 },
    ]);
    expect(items).toEqual([{ name: '醤油', amount: '大さじ2 + 適量', usedBy: ['A', 'B'] }]);
  });

  it('選択がなければ空', () => {
    expect(buildShoppingList([])).toEqual([]);
  });
});

describe('shoppingListMarkdown', () => {
  it('チェックボックス付きリストを組み立てる', () => {
    const md = shoppingListMarkdown([
      { name: '玉ねぎ', amount: '3個', usedBy: ['肉じゃが'] },
      { name: '塩', amount: '少々', usedBy: ['A', 'B'] },
    ]);
    expect(md).toBe('# 買い物リスト\n\n- [ ] 玉ねぎ 3個\n- [ ] 塩 少々\n');
  });

  it('空のときはその旨を書く', () => {
    expect(shoppingListMarkdown([])).toContain('品目はありません。');
  });

  it('チェック済みの品は[x]で出す', () => {
    const md = shoppingListMarkdown(
      [
        { name: '玉ねぎ', amount: '3個', usedBy: ['肉じゃが'] },
        { name: '塩', amount: '少々', usedBy: ['A'] },
      ],
      '買い物リスト',
      new Set(['玉ねぎ']),
    );
    expect(md).toBe('# 買い物リスト\n\n- [x] 玉ねぎ 3個\n- [ ] 塩 少々\n');
  });
});

describe('countRemaining', () => {
  const items = [
    { name: '玉ねぎ', amount: '3個', usedBy: ['A'] },
    { name: '塩', amount: '少々', usedBy: ['A'] },
    { name: '醤油', amount: '大さじ2', usedBy: ['A'] },
  ];

  it('チェック済みを除いた残り品目数を返す', () => {
    expect(countRemaining(items, new Set())).toBe(3);
    expect(countRemaining(items, new Set(['玉ねぎ', '醤油']))).toBe(1);
  });

  it('リストにない名前のチェックは数に影響しない', () => {
    expect(countRemaining(items, new Set(['にんじん']))).toBe(3);
  });
});
