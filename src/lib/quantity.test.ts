import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  normalizeAmount,
  parseNumber,
  parseQuantity,
  roundToNiceFraction,
  scaleAmount,
  scaleQuantity,
} from './quantity';

describe('normalizeAmount', () => {
  it('全角数字と記号を半角にし、空白を取り除く', () => {
    expect(normalizeAmount('200g')).toBe('200g');
    expect(normalizeAmount('大さじ 1')).toBe('大さじ1');
    expect(normalizeAmount('1/2 個')).toBe('1/2個');
  });
});

describe('parseNumber', () => {
  it('整数・小数・分数・帯分数を読む', () => {
    expect(parseNumber('2')).toBe(2);
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('1/2')).toBe(0.5);
    expect(parseNumber('1と1/2')).toBe(1.5);
  });

  it('読めない形と0除算はnull', () => {
    expect(parseNumber('適量')).toBeNull();
    expect(parseNumber('1/0')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});

describe('parseQuantity', () => {
  it('後置単位を分解する', () => {
    expect(parseQuantity('200g')).toEqual({
      kind: 'numeric',
      value: 200,
      unit: 'g',
      unitPosition: 'suffix',
    });
    expect(parseQuantity('1/2個')).toEqual({
      kind: 'numeric',
      value: 0.5,
      unit: '個',
      unitPosition: 'suffix',
    });
    expect(parseQuantity('1.5本')).toEqual({
      kind: 'numeric',
      value: 1.5,
      unit: '本',
      unitPosition: 'suffix',
    });
  });

  it('前置単位(大さじ・小さじ・カップ)を分解する', () => {
    expect(parseQuantity('大さじ2')).toEqual({
      kind: 'numeric',
      value: 2,
      unit: '大さじ',
      unitPosition: 'prefix',
    });
    expect(parseQuantity('小さじ1と1/2')).toEqual({
      kind: 'numeric',
      value: 1.5,
      unit: '小さじ',
      unitPosition: 'prefix',
    });
  });

  it('全角表記も読める', () => {
    expect(parseQuantity('200g')).toEqual({
      kind: 'numeric',
      value: 200,
      unit: 'g',
      unitPosition: 'suffix',
    });
  });

  it('数えられない表記はそのまま保つ', () => {
    expect(parseQuantity('適量')).toEqual({ kind: 'free', text: '適量' });
    expect(parseQuantity('少々')).toEqual({ kind: 'free', text: '少々' });
    expect(parseQuantity('ひとつまみ')).toEqual({ kind: 'free', text: 'ひとつまみ' });
  });
});

describe('roundToNiceFraction', () => {
  it('1/4・1/3・1/2・2/3・3/4の最近傍へ丸める', () => {
    expect(roundToNiceFraction(0.5)).toEqual({ whole: 0, fracText: '1/2' });
    expect(roundToNiceFraction(1.33)).toEqual({ whole: 1, fracText: '1/3' });
    expect(roundToNiceFraction(2.7)).toEqual({ whole: 2, fracText: '2/3' });
    expect(roundToNiceFraction(0.9)).toEqual({ whole: 1, fracText: '' });
    expect(roundToNiceFraction(3)).toEqual({ whole: 3, fracText: '' });
  });
});

describe('formatQuantity / scaleQuantity', () => {
  it('連続量(g・ml)は数値で丸める', () => {
    expect(scaleAmount('200g', 1.5)).toBe('300g');
    expect(scaleAmount('100ml', 1 / 3)).toBe('33ml');
    expect(scaleAmount('5g', 1.5)).toBe('7.5g');
  });

  it('さじ・個数は分数で表す', () => {
    expect(scaleAmount('大さじ1', 1.5)).toBe('大さじ1と1/2');
    expect(scaleAmount('小さじ1', 0.5)).toBe('小さじ1/2');
    expect(scaleAmount('1個', 0.5)).toBe('1/2個');
    expect(scaleAmount('2枚', 1.5)).toBe('3枚');
    expect(scaleAmount('1/2本', 2)).toBe('1本');
  });

  it('数えられない表記は倍率をかけても変わらない', () => {
    expect(scaleAmount('適量', 3)).toBe('適量');
    const q = parseQuantity('少々');
    expect(scaleQuantity(q, 2)).toEqual(q);
  });

  it('単位の位置が保たれる', () => {
    expect(formatQuantity(parseQuantity('1カップ'))).toBe('1カップ');
    expect(formatQuantity(parseQuantity('カップ1'))).toBe('カップ1');
  });
});
