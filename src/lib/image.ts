// レシピ写真のURLを扱う。ユーザーが貼り付けたURLはhttp(s)に限定して受け入れ、
// 配信サイズを変えられるホスト(Unsplash・Lorem Picsum)なら幅と切り抜きを
// クエリ/パスに反映して srcset を組む。それ以外のURLはそのまま使い、表示側の
// object-fit に切り抜きを任せる。

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/** http(s)の絶対URLだけを通す。javascript: や data: などは弾く */
export function isSafeImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return SAFE_PROTOCOLS.has(parsed.protocol);
}

export interface ImageSize {
  /** 配信したい横幅(px) */
  width: number;
  /** 横/縦の比。指定すると切り抜きホストでは高さも固定する */
  aspect?: number;
}

/** 指定ホストかどうかを末尾一致で判定する(サブドメイン配信に備える) */
function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

/**
 * URLを指定幅(必要なら指定アスペクト比)の配信URLへ変換する。
 * Unsplashはクエリ、Picsumはパス末尾の寸法で指定する。未対応ホストは素通し。
 */
export function imageVariant(url: string, size: ImageSize): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const width = Math.round(size.width);
  const height = size.aspect ? Math.round(width / size.aspect) : undefined;

  if (hostMatches(u.hostname, 'images.unsplash.com')) {
    u.searchParams.set('w', String(width));
    if (height !== undefined) u.searchParams.set('h', String(height));
    u.searchParams.set('q', '70');
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'crop');
    return u.toString();
  }

  if (hostMatches(u.hostname, 'picsum.photos')) {
    const dims = height !== undefined ? `${width}/${height}` : `${width}`;
    // 末尾の /幅 または /幅/高さ を差し替える(無ければ付け足す)
    u.pathname = u.pathname.replace(/\/\d+(?:\/\d+)?$/, '');
    u.pathname = `${u.pathname.replace(/\/$/, '')}/${dims}`;
    return u.toString();
  }

  return url;
}

/** 複数幅の srcset を作る。表示側は sizes 属性で実寸を伝える */
export function imageSrcset(url: string, widths: number[], aspect?: number): string {
  return widths.map((w) => `${imageVariant(url, { width: w, aspect })} ${w}w`).join(', ');
}
