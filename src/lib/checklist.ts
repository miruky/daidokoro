// 買い物リストで「買った」材料を覚えておく。品目名の集合をそのまま保存し、
// レシピの選び直しでリストが変わっても、同じ名前の品はチェックを引き継ぐ。

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CHECK_KEY = 'daidokoro.checked.v1';

export function loadChecked(storage: StorageLike): Set<string> {
  try {
    const raw = storage.getItem(CHECK_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

export function saveChecked(storage: StorageLike, names: Set<string>): void {
  try {
    storage.setItem(CHECK_KEY, JSON.stringify([...names]));
  } catch {
    // 保存できない環境(プライベートモード等)では揮発させる。
  }
}
