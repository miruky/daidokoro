// キーボードショートカットの解決。DOMに触れず、押されたキーと文脈から
// 実行すべき操作を返す純関数にして、配線(app.ts)と切り離してテストする。
// 入力欄にフォーカスがある間は、Escape を除き発火させない。

export type Shortcut =
  | { type: 'focus-search' }
  | { type: 'new-recipe' }
  | { type: 'go-list' }
  | { type: 'go-shopping' }
  | { type: 'help' };

export interface KeyContext {
  key: string;
  /** 直前に g が押され、続きのキーを待っている状態か(g→l などの連続キー) */
  pendingG: boolean;
  /** 入力欄(input/textarea/select・contenteditable)で文字入力中か */
  typing: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
}

/** g に続けて押すキーを待つ前置キーか。入力中は前置にしない。 */
export function isPrefixKey(key: string, typing: boolean): boolean {
  return !typing && key === 'g';
}

export function resolveShortcut(ctx: KeyContext): Shortcut | null {
  // 修飾キー併用はブラウザ/OSのショートカットを尊重して無視する
  if (ctx.ctrl || ctx.meta || ctx.alt) return null;
  if (ctx.typing) return null;

  if (ctx.pendingG) {
    if (ctx.key === 'l') return { type: 'go-list' };
    if (ctx.key === 's') return { type: 'go-shopping' };
    return null;
  }

  switch (ctx.key) {
    case '/':
      return { type: 'focus-search' };
    case 'n':
      return { type: 'new-recipe' };
    case '?':
      return { type: 'help' };
    default:
      return null;
  }
}
