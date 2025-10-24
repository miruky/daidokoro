// URLハッシュと画面の対応。#/recipe/<id> のような素朴なハッシュルーティングで、
// リロードやブックマークでも同じ画面に戻れるようにする。

export type Route =
  | { view: 'list' }
  | { view: 'new' }
  | { view: 'detail'; id: string }
  | { view: 'edit'; id: string }
  | { view: 'shopping' };

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#/, '')
    .split('/')
    .filter((p) => p !== '');
  if (parts[0] === 'recipe' && parts[1] !== undefined) {
    if (parts[2] === 'edit') return { view: 'edit', id: parts[1] };
    return { view: 'detail', id: parts[1] };
  }
  if (parts[0] === 'new') return { view: 'new' };
  if (parts[0] === 'shopping') return { view: 'shopping' };
  return { view: 'list' };
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'list':
      return '#/';
    case 'new':
      return '#/new';
    case 'detail':
      return `#/recipe/${route.id}`;
    case 'edit':
      return `#/recipe/${route.id}/edit`;
    case 'shopping':
      return '#/shopping';
  }
}
