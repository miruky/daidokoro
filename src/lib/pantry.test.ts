import { describe, expect, it } from 'vitest';
import { loadPantry, savePantry } from './pantry';

/** localStorage を持たないNode環境でも回せるよう、Mapで代用する */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => void map.set(key, value),
  };
}

describe('loadPantry', () => {
  it('未保存なら空集合', () => {
    expect(loadPantry(memoryStorage()).size).toBe(0);
  });

  it('保存した名前を集合で返す', () => {
    const storage = memoryStorage({ 'daidokoro.pantry.v1': '["塩","砂糖","醤油"]' });
    expect([...loadPantry(storage)]).toEqual(['塩', '砂糖', '醤油']);
  });

  it('壊れたJSONや配列でない値は空集合にフォールバックする', () => {
    expect(loadPantry(memoryStorage({ 'daidokoro.pantry.v1': '{' })).size).toBe(0);
    expect(loadPantry(memoryStorage({ 'daidokoro.pantry.v1': '"塩"' })).size).toBe(0);
  });

  it('文字列でない要素は読み飛ばす', () => {
    const storage = memoryStorage({ 'daidokoro.pantry.v1': '["塩",1,null,"砂糖"]' });
    expect([...loadPantry(storage)]).toEqual(['塩', '砂糖']);
  });
});

describe('savePantry', () => {
  it('保存した内容をそのまま読み戻せる', () => {
    const storage = memoryStorage();
    savePantry(storage, new Set(['塩', 'こしょう']));
    expect([...loadPantry(storage)]).toEqual(['塩', 'こしょう']);
  });

  it('setItemが例外を投げても落とさない', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => savePantry(storage, new Set(['塩']))).not.toThrow();
  });
});
