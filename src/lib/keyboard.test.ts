import { describe, expect, it } from 'vitest';
import { isPrefixKey, resolveShortcut, type KeyContext } from './keyboard';

function ctx(over: Partial<KeyContext>): KeyContext {
  return { key: '', pendingG: false, typing: false, ctrl: false, meta: false, alt: false, ...over };
}

describe('resolveShortcut', () => {
  it('単独キーを操作に対応づける', () => {
    expect(resolveShortcut(ctx({ key: '/' }))).toEqual({ type: 'focus-search' });
    expect(resolveShortcut(ctx({ key: 'n' }))).toEqual({ type: 'new-recipe' });
    expect(resolveShortcut(ctx({ key: '?' }))).toEqual({ type: 'help' });
  });

  it('g の前置に続けて画面遷移を解決する', () => {
    expect(resolveShortcut(ctx({ key: 'l', pendingG: true }))).toEqual({ type: 'go-list' });
    expect(resolveShortcut(ctx({ key: 's', pendingG: true }))).toEqual({ type: 'go-shopping' });
    expect(resolveShortcut(ctx({ key: 'x', pendingG: true }))).toBeNull();
  });

  it('入力欄での文字入力中は発火しない', () => {
    expect(resolveShortcut(ctx({ key: '/', typing: true }))).toBeNull();
    expect(resolveShortcut(ctx({ key: 'n', typing: true }))).toBeNull();
  });

  it('修飾キー併用は無視してブラウザ既定に譲る', () => {
    expect(resolveShortcut(ctx({ key: 'n', meta: true }))).toBeNull();
    expect(resolveShortcut(ctx({ key: 'n', ctrl: true }))).toBeNull();
    expect(resolveShortcut(ctx({ key: 'n', alt: true }))).toBeNull();
  });

  it('割り当ての無いキーはnull', () => {
    expect(resolveShortcut(ctx({ key: 'z' }))).toBeNull();
  });
});

describe('isPrefixKey', () => {
  it('入力中でなければ g を前置キーとみなす', () => {
    expect(isPrefixKey('g', false)).toBe(true);
  });

  it('入力中の g や g 以外は前置にしない', () => {
    expect(isPrefixKey('g', true)).toBe(false);
    expect(isPrefixKey('n', false)).toBe(false);
  });
});
