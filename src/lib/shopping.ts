// 複数レシピの材料を名寄せして買い物リストを作る。

import { formatQuantity, parseQuantity, type Quantity } from './quantity';
import { scaleIngredients, type Recipe } from './recipes';

export interface ShoppingSelection {
  recipe: Recipe;
  /** 作る人数 */
  servings: number;
}

export interface ShoppingItem {
  name: string;
  /** 「400g」「大さじ3」「適量」など。単位が混在する場合は「200g + 1個」のように併記 */
  amount: string;
  /** この材料を使うレシピ名 */
  usedBy: string[];
}

interface Bucket {
  name: string;
  /** 単位ごとの数値合計。キーは unitPosition:unit */
  sums: Map<string, { value: number; sample: Quantity & { kind: 'numeric' } }>;
  /** 「適量」「少々」のような数えられない表記(重複排除) */
  free: Set<string>;
  usedBy: Set<string>;
}

/** 選んだレシピを人数換算し、材料名で名寄せして合算する */
export function buildShoppingList(selections: ShoppingSelection[]): ShoppingItem[] {
  const buckets = new Map<string, Bucket>();

  for (const { recipe, servings } of selections) {
    for (const ing of scaleIngredients(recipe, servings)) {
      const bucket = buckets.get(ing.name) ?? {
        name: ing.name,
        sums: new Map(),
        free: new Set<string>(),
        usedBy: new Set<string>(),
      };
      const q = parseQuantity(ing.amount);
      if (q.kind === 'numeric') {
        const key = `${q.unitPosition}:${q.unit}`;
        const entry = bucket.sums.get(key);
        if (entry) {
          entry.value += q.value;
        } else {
          bucket.sums.set(key, { value: q.value, sample: q });
        }
      } else {
        bucket.free.add(q.text);
      }
      bucket.usedBy.add(recipe.name);
      buckets.set(ing.name, bucket);
    }
  }

  return [...buckets.values()].map((b) => {
    const parts: string[] = [];
    for (const { value, sample } of b.sums.values()) {
      parts.push(formatQuantity({ ...sample, value }));
    }
    parts.push(...b.free);
    return {
      name: b.name,
      amount: parts.join(' + '),
      usedBy: [...b.usedBy],
    };
  });
}

export interface PartitionedList {
  /** 買う必要のある品目 */
  list: ShoppingItem[];
  /** 常備品として除外した品目 */
  stocked: ShoppingItem[];
}

/** 常備品に登録された材料を買い物リストから分離する。元の並び順は保つ。 */
export function partitionPantry(
  items: ShoppingItem[],
  pantry: ReadonlySet<string>,
): PartitionedList {
  const list: ShoppingItem[] = [];
  const stocked: ShoppingItem[] = [];
  for (const item of items) {
    (pantry.has(item.name) ? stocked : list).push(item);
  }
  return { list, stocked };
}

/** まだ買っていない品目の数。チェック済みは名前で判定する。 */
export function countRemaining(items: ShoppingItem[], checked: ReadonlySet<string>): number {
  return items.reduce((n, item) => (checked.has(item.name) ? n : n + 1), 0);
}

/** チェックボックス付きMarkdownにする。買った品は[x]で出す。 */
export function shoppingListMarkdown(
  items: ShoppingItem[],
  heading = '買い物リスト',
  checked: ReadonlySet<string> = new Set(),
): string {
  const lines = [`# ${heading}`, ''];
  if (items.length === 0) {
    lines.push('品目はありません。', '');
    return lines.join('\n');
  }
  for (const item of items) {
    const mark = checked.has(item.name) ? 'x' : ' ';
    lines.push(`- [${mark}] ${item.name} ${item.amount}`);
  }
  lines.push('');
  return lines.join('\n');
}
