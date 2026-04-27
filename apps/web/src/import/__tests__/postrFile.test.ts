import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../postrFile';

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
