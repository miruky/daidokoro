import './style.css';
import { createApp } from './app';
import { createStore } from './lib/recipes';
import { seedRecipes } from './lib/seed';

const root = document.getElementById('app');
if (!root) throw new Error('#app が見つかりません');

const store = createStore(localStorage);

// 初回起動だけ見本レシピを入れて保存する。一度でも保存があれば
// (全件削除して空にした場合も含めて)その状態を尊重する。
let recipes = store.load();
if (recipes === null) {
  recipes = seedRecipes(Date.now());
  store.save(recipes);
}

createApp({ root, store, initialRecipes: recipes });
