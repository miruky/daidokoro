// レシピの型・検証・行形式の取り込み・永続化。

import { scaleAmount } from './quantity';

export interface Ingredient {
  name: string;
  /** 分量の表記そのまま(「200g」「大さじ1」「適量」) */
  amount: string;
}

export interface Recipe {
  id: string;
  name: string;
  /** 材料表が想定する人数 */
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
  memo: string;
  updatedAt: number;
}

export const MAX_SERVINGS = 12;

export function newRecipeId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 材料の一括入力を解釈する。1行に「材料名 分量」を空白区切りで書く。
 * 最後の空白より後ろを分量、前を材料名とする。分量のない行は「適量」扱い。
 */
export function parseIngredientLines(text: string): Ingredient[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const splitAt = Math.max(line.lastIndexOf(' '), line.lastIndexOf('　'));
      if (splitAt <= 0) return { name: line, amount: '適量' };
      return {
        name: line.slice(0, splitAt).trim(),
        amount: line.slice(splitAt + 1).trim(),
      };
    });
}

export function ingredientsToLines(ingredients: Ingredient[]): string {
  return ingredients.map((i) => `${i.name} ${i.amount}`).join('\n');
}

export function parseSteps(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/^\d+[.、)]\s*/, ''))
    .filter((line) => line !== '');
}

/** 検証エラーを日本語で返す。空配列なら妥当 */
export function validateRecipe(r: Pick<Recipe, 'name' | 'servings' | 'ingredients'>): string[] {
  const errors: string[] = [];
  if (r.name.trim() === '') errors.push('レシピ名を入れてください。');
  if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > MAX_SERVINGS) {
    errors.push(`人数は1〜${MAX_SERVINGS}の整数にしてください。`);
  }
  if (r.ingredients.length === 0) errors.push('材料を1つ以上入れてください。');
  return errors;
}

/** 材料表を指定人数に換算する */
export function scaleIngredients(recipe: Recipe, servings: number): Ingredient[] {
  const factor = servings / recipe.servings;
  if (factor === 1) return recipe.ingredients;
  return recipe.ingredients.map((i) => ({ name: i.name, amount: scaleAmount(i.amount, factor) }));
}

function isIngredient(value: unknown): value is Ingredient {
  if (typeof value !== 'object' || value === null) return false;
  const i = value as Record<string, unknown>;
  return typeof i.name === 'string' && i.name !== '' && typeof i.amount === 'string';
}

function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    r.name !== '' &&
    typeof r.servings === 'number' &&
    Number.isInteger(r.servings) &&
    r.servings >= 1 &&
    Array.isArray(r.ingredients) &&
    r.ingredients.every(isIngredient) &&
    Array.isArray(r.steps) &&
    (r.steps as unknown[]).every((s) => typeof s === 'string') &&
    typeof r.memo === 'string' &&
    typeof r.updatedAt === 'number'
  );
}

/** JSON文字列から復元する。形の崩れた要素は読み飛ばす */
export function deserializeRecipes(json: string): Recipe[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecipe);
}

export function serializeRecipes(recipes: Recipe[]): string {
  return JSON.stringify(recipes);
}

export interface RecipeStore {
  load(): Recipe[] | null;
  save(recipes: Recipe[]): void;
}

const STORAGE_KEY = 'daidokoro.recipes.v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createStore(storage: StorageLike): RecipeStore {
  return {
    // 「保存されていない」(null)と「全件削除した」(空配列)を区別する
    load() {
      const raw = storage.getItem(STORAGE_KEY);
      return raw === null ? null : deserializeRecipes(raw);
    },
    save(recipes) {
      storage.setItem(STORAGE_KEY, serializeRecipes(recipes));
    },
  };
}
