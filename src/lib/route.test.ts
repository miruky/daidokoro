import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, type Route } from './route';

describe('parseRoute', () => {
  it('空や見覚えのないハッシュは一覧にする', () => {
    expect(parseRoute('')).toEqual({ view: 'list' });
    expect(parseRoute('#')).toEqual({ view: 'list' });
    expect(parseRoute('#/')).toEqual({ view: 'list' });
    expect(parseRoute('#/somewhere')).toEqual({ view: 'list' });
  });

  it('レシピ詳細と編集を区別する', () => {
    expect(parseRoute('#/recipe/r-abc')).toEqual({ view: 'detail', id: 'r-abc' });
    expect(parseRoute('#/recipe/r-abc/edit')).toEqual({ view: 'edit', id: 'r-abc' });
  });

  it('idのないレシピパスは一覧に落とす', () => {
    expect(parseRoute('#/recipe')).toEqual({ view: 'list' });
    expect(parseRoute('#/recipe/')).toEqual({ view: 'list' });
  });

  it('新規作成と買い物リストを読む', () => {
    expect(parseRoute('#/new')).toEqual({ view: 'new' });
    expect(parseRoute('#/shopping')).toEqual({ view: 'shopping' });
  });
});

describe('routeHash', () => {
  it('parseRouteと往復しても情報が落ちない', () => {
    const routes: Route[] = [
      { view: 'list' },
      { view: 'new' },
      { view: 'detail', id: 'r-1' },
      { view: 'edit', id: 'r-1' },
      { view: 'shopping' },
    ];
    for (const route of routes) {
      expect(parseRoute(routeHash(route))).toEqual(route);
    }
  });
});
