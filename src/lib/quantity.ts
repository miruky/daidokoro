// 日本語レシピの分量表記を構造化し、人数に合わせて倍率をかける。
// 「大さじ1と1/2」「200g」「1/2個」のような表記を数値+単位に分解し、
// 「適量」「少々」のような数えられない表記はそのまま保つ。

export type Quantity =
  | { kind: 'numeric'; value: number; unit: string; unitPosition: 'prefix' | 'suffix' }
  | { kind: 'free'; text: string };

/** 数の前に置く単位(大さじ2、小さじ1/2 など) */
const PREFIX_UNITS = ['大さじ', '小さじ', 'カップ'] as const;

// 「1と1/2」を最初に試し、次に「1/2」、最後に「1.5」。順序を変えると
// 「1/2個」が 数=1・単位=/2個 と誤分解される
const NUMBER_PATTERN = String.raw`\d+と\d+/\d+|\d+/\d+|\d+(?:\.\d+)?`;

const prefixRe = new RegExp(`^(${PREFIX_UNITS.join('|')})(${NUMBER_PATTERN})$`);
const suffixRe = new RegExp(`^(${NUMBER_PATTERN})(.*)$`);

/** 全角数字・全角記号を半角に直し、空白を取り除く */
export function normalizeAmount(text: string): string {
  return text
    .replace(/[０-９．／]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '');
}

/** 「1と1/2」「1/2」「1.5」を数値にする。解釈できなければnull */
export function parseNumber(text: string): number | null {
  const mixed = /^(\d+)と(\d+)\/(\d+)$/.exec(text);
  if (mixed) {
    const [, whole, num, den] = mixed;
    if (Number(den) === 0) return null;
    return Number(whole) + Number(num) / Number(den);
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    const [, num, den] = fraction;
    if (Number(den) === 0) return null;
    return Number(num) / Number(den);
  }
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  return null;
}

export function parseQuantity(raw: string): Quantity {
  const text = normalizeAmount(raw);

  const prefixed = prefixRe.exec(text);
  if (prefixed) {
    const [, unit, num] = prefixed;
    const value = parseNumber(num ?? '');
    if (value !== null && unit !== undefined) {
      return { kind: 'numeric', value, unit, unitPosition: 'prefix' };
    }
  }

  const suffixed = suffixRe.exec(text);
  if (suffixed) {
    const [, num, unit] = suffixed;
    const value = parseNumber(num ?? '');
    // 単位なしの裸の数(「2」=2個分のような表記)も数値として扱う
    if (value !== null && unit !== undefined && !unit.includes('/')) {
      return { kind: 'numeric', value, unit, unitPosition: 'suffix' };
    }
  }

  return { kind: 'free', text: raw.trim() };
}

/** 連続量の単位。これらは小数で丸め、それ以外は1/4刻みの分数で表す */
const CONTINUOUS_UNITS = new Set(['g', 'kg', 'ml', 'mL', 'l', 'L', 'cc']);

/** 値を「きれいな」分数(1/4・1/3・1/2・2/3・3/4)へ最近傍で丸める */
export function roundToNiceFraction(value: number): { whole: number; fracText: string } {
  const whole = Math.floor(value);
  const rest = value - whole;
  const candidates: Array<[number, string]> = [
    [0, ''],
    [1 / 4, '1/4'],
    [1 / 3, '1/3'],
    [1 / 2, '1/2'],
    [2 / 3, '2/3'],
    [3 / 4, '3/4'],
    [1, ''],
  ];
  let best: [number, string] = [0, ''];
  let bestErr = Infinity;
  for (const [frac, label] of candidates) {
    const err = Math.abs(rest - frac);
    if (err < bestErr) {
      bestErr = err;
      best = [frac, label];
    }
  }
  if (best[0] === 1) return { whole: whole + 1, fracText: '' };
  return { whole, fracText: best[1] };
}

function formatNumber(value: number, unit: string): string {
  if (CONTINUOUS_UNITS.has(unit)) {
    // 10未満は0.5刻み、それ以上は整数に丸める
    if (value < 10) return String(Math.round(value * 2) / 2);
    return String(Math.round(value));
  }
  const { whole, fracText } = roundToNiceFraction(value);
  if (fracText === '') return String(whole);
  if (whole === 0) return fracText;
  return `${whole}と${fracText}`;
}

export function formatQuantity(q: Quantity): string {
  if (q.kind === 'free') return q.text;
  const num = formatNumber(q.value, q.unit);
  return q.unitPosition === 'prefix' ? `${q.unit}${num}` : `${num}${q.unit}`;
}

export function scaleQuantity(q: Quantity, factor: number): Quantity {
  if (q.kind === 'free') return q;
  return { ...q, value: q.value * factor };
}

/** 表記のまま倍率をかける。「大さじ1」x1.5 -> 「大さじ1と1/2」、「適量」はそのまま */
export function scaleAmount(raw: string, factor: number): string {
  return formatQuantity(scaleQuantity(parseQuantity(raw), factor));
}
