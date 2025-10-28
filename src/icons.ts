// UIで使う線画アイコン。24pxグリッド・stroke=currentColorで統一し、
// 隣に必ずテキストラベルを置く前提ですべて装飾(aria-hidden)とする。

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  logo: svg(
    '<path d="M9.5 2.8c-.7.9.7 1.6 0 2.5"/>' +
      '<path d="M14.5 2.8c-.7.9.7 1.6 0 2.5"/>' +
      '<path d="M4.5 12c2.5-2.7 12.5-2.7 15 0"/>' +
      '<circle cx="12" cy="9.2" r="1"/>' +
      '<path d="M3.5 14.5h17v.8a5.7 5.7 0 0 1-5.7 5.7H9.2a5.7 5.7 0 0 1-5.7-5.7z"/>',
  ),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  pencil: svg('<path d="m16.9 3.8 3.3 3.3L8.6 18.7 4 20l1.3-4.6z"/><path d="m14.5 6.2 3.3 3.3"/>'),
  trash: svg(
    '<path d="M4 7h16"/>' +
      '<path d="M9.5 7V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v2"/>' +
      '<path d="m6.5 7 .7 11.2a2 2 0 0 0 2 1.8h5.6a2 2 0 0 0 2-1.8L17.5 7"/>' +
      '<path d="M10 11v5.5"/><path d="M14 11v5.5"/>',
  ),
  back: svg('<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>'),
  basket: svg(
    '<path d="M5 9h14l-1.2 9.3a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7z"/>' +
      '<path d="M9 9V7a3 3 0 0 1 6 0v2"/>',
  ),
  copy: svg(
    '<rect x="9" y="9" width="11" height="11" rx="2"/>' + '<path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  ),
  download: svg('<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>'),
  upload: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>'),
  check: svg('<path d="m5 13 4.5 4.5L19 7"/>'),
  image: svg(
    '<rect x="3.5" y="5" width="17" height="14" rx="2"/>' +
      '<circle cx="8.5" cy="10" r="1.3"/>' +
      '<path d="m4.5 17 4.5-4.2a2 2 0 0 1 2.7 0L20 19"/>',
  ),
  // 写真の無いレシピに置く配膳ドーム(クローシュ)。料理を示す装飾
  dish: svg('<path d="M4 16.5a8 8 0 0 1 16 0"/><path d="M2.5 16.5h19"/><path d="M12 8.5v-2"/>'),
  print: svg(
    '<path d="M7 9V4h10v5"/>' +
      '<path d="M7 18H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/>' +
      '<rect x="7" y="15" width="10" height="6" rx="1"/>',
  ),
  // 常備品(いつも家にある材料)を表す保存瓶
  jar: svg(
    '<path d="M8.5 3.5h7"/>' +
      '<path d="M7.5 6.5h9"/>' +
      '<path d="M9 6.5c0 1-.4 1.7-1.1 2.3A3.5 3.5 0 0 0 6.5 11.4V18a2.5 2.5 0 0 0 2.5 2.5h6a2.5 2.5 0 0 0 2.5-2.5v-6.6a3.5 3.5 0 0 0-1.4-2.6c-.7-.6-1.1-1.3-1.1-2.3"/>' +
      '<path d="M9.5 13.5h5"/>',
  ),
  keyboard: svg(
    '<rect x="2.5" y="6" width="19" height="12" rx="2"/>' +
      '<path d="M6 9.5h.01"/><path d="M9.5 9.5h.01"/><path d="M13 9.5h.01"/><path d="M16.5 9.5h.01"/>' +
      '<path d="M6 12.5h.01"/><path d="M9.5 12.5h.01"/><path d="M13 12.5h.01"/><path d="M16.5 12.5h.01"/>' +
      '<path d="M8 15.5h8"/>',
  ),
} as const;
