import { describe, expect, it } from 'vitest';
import { imageSrcset, imageVariant, isSafeImageUrl } from './image';

describe('isSafeImageUrl', () => {
  it('http(s)の絶対URLを通す', () => {
    expect(isSafeImageUrl('https://images.unsplash.com/photo-1')).toBe(true);
    expect(isSafeImageUrl('http://example.com/a.jpg')).toBe(true);
  });

  it('スクリプトや相対・不正なURLを弾く', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isSafeImageUrl('/local/path.jpg')).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
  });
});

describe('imageVariant', () => {
  it('Unsplashは幅・品質・切り抜きをクエリに付ける', () => {
    const out = new URL(imageVariant('https://images.unsplash.com/photo-1', { width: 400 }));
    expect(out.searchParams.get('w')).toBe('400');
    expect(out.searchParams.get('q')).toBe('70');
    expect(out.searchParams.get('fit')).toBe('crop');
    expect(out.searchParams.get('h')).toBeNull();
  });

  it('アスペクト比から高さを算出する', () => {
    const out = new URL(
      imageVariant('https://images.unsplash.com/p', { width: 600, aspect: 3 / 2 }),
    );
    expect(out.searchParams.get('w')).toBe('600');
    expect(out.searchParams.get('h')).toBe('400');
  });

  it('Picsumはパス末尾の寸法を差し替える', () => {
    expect(imageVariant('https://picsum.photos/seed/nabe/800/600', { width: 200 })).toBe(
      'https://picsum.photos/seed/nabe/200',
    );
    expect(imageVariant('https://picsum.photos/seed/nabe/800/600', { width: 200, aspect: 1 })).toBe(
      'https://picsum.photos/seed/nabe/200/200',
    );
  });

  it('未対応ホスト・不正URLは素通しする', () => {
    expect(imageVariant('https://example.com/a.jpg', { width: 200 })).toBe(
      'https://example.com/a.jpg',
    );
    expect(imageVariant('not a url', { width: 200 })).toBe('not a url');
  });
});

describe('imageSrcset', () => {
  it('幅ごとのURLと記述子を並べる', () => {
    const set = imageSrcset('https://images.unsplash.com/p', [200, 400], 1);
    const entries = set.split(', ');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatch(/ 200w$/);
    expect(entries[1]).toMatch(/ 400w$/);
    expect(entries[0]).toContain('w=200');
    expect(entries[0]).toContain('h=200');
  });
});
