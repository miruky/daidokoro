import { describe, expect, it } from 'vitest';
import { isSafeImageUrl } from './image';
import { deserializeRecipes, serializeRecipes, validateRecipe } from './recipes';
import { seedRecipes } from './seed';

describe('seedRecipes', () => {
  const seeds = seedRecipes(1000);

  it('見本はすべて検証を通る', () => {
    for (const r of seeds) expect(validateRecipe(r)).toEqual([]);
  });

  it('IDが重複しない', () => {
    expect(new Set(seeds.map((r) => r.id)).size).toBe(seeds.length);
  });

  it('写真は安全なhttps URLを持つ', () => {
    for (const r of seeds) {
      expect(r.image).toBeDefined();
      expect(isSafeImageUrl(r.image ?? '')).toBe(true);
      expect(r.image?.startsWith('https://')).toBe(true);
    }
  });

  it('保存形式と往復しても変わらない', () => {
    expect(deserializeRecipes(serializeRecipes(seeds))).toEqual(seeds);
  });

  it('渡した時刻が更新日時になる', () => {
    expect(seedRecipes(42).every((r) => r.updatedAt === 42)).toBe(true);
  });
});
