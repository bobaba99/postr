import { describe, expect, it } from 'vitest';
import { canonicalJson, exportPostr, importPostr } from '../postrFile';
import type { PosterDoc } from '@postr/shared';

const minimalDoc: PosterDoc = {
  version: 1,
  widthIn: 36,
  heightIn: 48,
  blocks: [],
  fontFamily: 'Source Sans 3',
  palette: {
    bg: '#fff',
    primary: '#111',
    accent: '#0f4c75',
    accent2: '#3282b8',
    muted: '#6c757d',
    headerBg: '#0f4c75',
    headerFg: '#fff',
  },
  styles: {
    title: { size: 22, weight: 800, italic: false, lineHeight: 1.15, color: null, highlight: null },
    authors: { size: 5, weight: 400, italic: false, lineHeight: 1.15, color: null, highlight: null },
    heading: { size: 8, weight: 700, italic: false, lineHeight: 1.3, color: null, highlight: null },
    body: { size: 5, weight: 400, italic: false, lineHeight: 1.55, color: null, highlight: null },
  },
  headingStyle: { border: 'bottom', fill: false, align: 'left' },
  institutions: [],
  authors: [],
  references: [],
};

describe('canonicalJson', () => {
  it('sorts object keys deterministically', () => {
    const a = canonicalJson({ b: 2, a: 1, c: 3 });
    const b = canonicalJson({ c: 3, a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"c":3}');
  });

  it('preserves array order', () => {
    const out = canonicalJson([3, 1, 2]);
    expect(out).toBe('[3,1,2]');
  });

  it('handles nested objects with mixed key orders', () => {
    const a = canonicalJson({ outer: { z: 1, a: 2 }, b: 3 });
    const b = canonicalJson({ b: 3, outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it('handles arrays of objects without reordering them', () => {
    const out = canonicalJson([{ b: 2, a: 1 }, { d: 4, c: 3 }]);
    expect(out).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  it('survives null and primitive values', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson(true)).toBe('true');
  });
});

describe('importPostr safety guards', () => {
  it('rejects bundles larger than the safety ceiling', async () => {
    // Build a fake "huge" file by mocking File.size — actual bytes
    // don't need to be present. Guards against zip-bomb DoS.
    const blob = new Blob(['fake'], { type: 'application/zip' });
    const file = new File([blob], 'huge.postr', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 200 * 1024 * 1024 });
    await expect(importPostr(file, 'p1', 'u1')).rejects.toThrow(/too large/i);
  });

  it('exportPostr resolves to a non-empty Blob', async () => {
    // Browser-only test for end-to-end zip integrity (jsdom's binary
    // Blob round-trip is unreliable). The manual e2e suite covers the
    // full export → import → hashMatch path.
    const blob = await exportPostr(minimalDoc);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/zip');
  });
});
