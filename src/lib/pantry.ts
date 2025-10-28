// 常備品(塩・砂糖・醤油など、いつも台所にある材料)を覚えておき、買い物リストから外す。
// 品目名の集合を端末に保存し、買い物リストの材料名と名前で突き合わせる。
// 名寄せ後の品目に対して使うので、レシピ本体には触れない。

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PANTRY_KEY = 'daidokoro.pantry.v1';

export function loadPantry(storage: StorageLike): Set<string> {
  try {
    const raw = storage.getItem(PANTRY_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

export function savePantry(storage: StorageLike, names: ReadonlySet<string>): void {
  try {
    storage.setItem(PANTRY_KEY, JSON.stringify([...names]));
  } catch {
    // 保存できない環境(プライベートモード等)では揮発させる。
  }
}
