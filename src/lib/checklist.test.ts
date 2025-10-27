import { describe, expect, it } from 'vitest';
import { loadChecked, saveChecked } from './checklist';

function memoryStorage(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
} {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe('買い物チェックの保存', () => {
  it('保存した集合を読み戻せる', () => {
    const storage = memoryStorage();
    saveChecked(storage, new Set(['玉ねぎ', '醤油']));
    expect(loadChecked(storage)).toEqual(new Set(['玉ねぎ', '醤油']));
  });

  it('未保存なら空集合', () => {
    expect(loadChecked(memoryStorage())).toEqual(new Set());
  });

  it('壊れた値や型違いは空集合へ落とす', () => {
    const storage = memoryStorage();
    storage.setItem('daidokoro.checked.v1', '{壊れた');
    expect(loadChecked(storage)).toEqual(new Set());
    storage.setItem('daidokoro.checked.v1', '{"a":1}');
    expect(loadChecked(storage)).toEqual(new Set());
    storage.setItem('daidokoro.checked.v1', '["玉ねぎ",3,null]');
    expect(loadChecked(storage)).toEqual(new Set(['玉ねぎ']));
  });
});
