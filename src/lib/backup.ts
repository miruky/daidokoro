// レシピ台帳をJSONファイルへ書き出し・読み込みする。端末をまたいだ移動や
// バックアップのための仕組みで、保存形式が変わっても読めるよう版番号を添える。

import { deserializeRecipes, serializeRecipes, type Recipe } from './recipes';

const FORMAT = 'daidokoro.recipes';
const VERSION = 1;

interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  recipes: Recipe[];
}

/** 書き出し用のJSON文字列を作る(人が読めるよう整形する) */
export function exportBackup(recipes: Recipe[], now: number = Date.now()): string {
  const data: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date(now).toISOString(),
    recipes,
  };
  return JSON.stringify(data, null, 2);
}

/**
 * バックアップJSONからレシピを取り出す。書き出し形式(envelope)でも、
 * レシピ配列そのものでも受け取り、形の崩れた要素は読み飛ばす。
 */
export function parseBackup(json: string): Recipe[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return deserializeRecipes(serializeRecipes(parsed as Recipe[]));
  if (parsed !== null && typeof parsed === 'object' && 'recipes' in parsed) {
    const recipes = (parsed as { recipes: unknown }).recipes;
    if (Array.isArray(recipes)) return deserializeRecipes(serializeRecipes(recipes as Recipe[]));
  }
  return [];
}

export interface MergeResult {
  recipes: Recipe[];
  /** 新たに加わった件数 */
  added: number;
  /** 同じIDで新しい内容に置き換えた件数 */
  updated: number;
}

/**
 * 取り込んだレシピを既存の台帳へ統合する。IDが同じものは更新日時の新しい方を
 * 残し、知らないIDは追加する。元の並び順は保ったまま新規を末尾に足す。
 */
export function mergeRecipes(existing: Recipe[], incoming: Recipe[]): MergeResult {
  const index = new Map(existing.map((r, i) => [r.id, i]));
  const merged = [...existing];
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    const at = index.get(r.id);
    if (at === undefined) {
      index.set(r.id, merged.length);
      merged.push(r);
      added += 1;
    } else if (r.updatedAt >= (merged[at]?.updatedAt ?? 0)) {
      merged[at] = r;
      updated += 1;
    }
  }
  return { recipes: merged, added, updated };
}
