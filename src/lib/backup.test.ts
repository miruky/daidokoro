import { describe, expect, it } from 'vitest';
import { exportBackup, mergeRecipes, parseBackup } from './backup';
import type { Recipe } from './recipes';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r-1',
    name: '肉じゃが',
    servings: 2,
    ingredients: [{ name: 'じゃがいも', amount: '3個' }],
    steps: ['切る', '煮る'],
    memo: '',
    updatedAt: 100,
    ...overrides,
  };
}

describe('exportBackup / parseBackup', () => {
  it('書き出したものを読み戻せる', () => {
    const recipes = [recipe(), recipe({ id: 'r-2', name: 'カレー' })];
    expect(parseBackup(exportBackup(recipes, 0))).toEqual(recipes);
  });

  it('版番号と書き出し日時を含める', () => {
    const data = JSON.parse(exportBackup([recipe()], 0));
    expect(data.format).toBe('daidokoro.recipes');
    expect(data.version).toBe(1);
    expect(data.exportedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('レシピ配列そのものも受け取る', () => {
    expect(parseBackup(JSON.stringify([recipe()]))).toEqual([recipe()]);
  });

  it('壊れたJSON・想定外の形・崩れた要素を弾く', () => {
    expect(parseBackup('{nope')).toEqual([]);
    expect(parseBackup('42')).toEqual([]);
    expect(parseBackup('{"recipes": "x"}')).toEqual([]);
    const json = JSON.stringify({ recipes: [recipe(), { id: 'x', name: '' }] });
    expect(parseBackup(json)).toEqual([recipe()]);
  });
});

describe('mergeRecipes', () => {
  it('知らないIDは末尾に追加する', () => {
    const existing = [recipe()];
    const incoming = [recipe({ id: 'r-2', name: 'カレー' })];
    const result = mergeRecipes(existing, incoming);
    expect(result.recipes).toHaveLength(2);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.recipes[1]?.name).toBe('カレー');
  });

  it('同じIDは新しい更新日時の方で置き換える', () => {
    const existing = [recipe({ updatedAt: 100, name: '旧' })];
    const incoming = [recipe({ updatedAt: 200, name: '新' })];
    const result = mergeRecipes(existing, incoming);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]?.name).toBe('新');
    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);
  });

  it('取り込み側が古ければ既存を残す', () => {
    const existing = [recipe({ updatedAt: 200, name: '新' })];
    const incoming = [recipe({ updatedAt: 100, name: '旧' })];
    const result = mergeRecipes(existing, incoming);
    expect(result.recipes[0]?.name).toBe('新');
    expect(result.updated).toBe(0);
  });

  it('元の台帳を書き換えない', () => {
    const existing = [recipe()];
    mergeRecipes(existing, [recipe({ id: 'r-2' })]);
    expect(existing).toHaveLength(1);
  });
});
