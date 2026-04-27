import { describe, it, expect } from 'vitest';
import { formatRetryAfter } from '../apiClient';

describe('formatRetryAfter', () => {
  it('falls back to "a moment" for zero / negative / non-finite', () => {
    expect(formatRetryAfter(0)).toBe('a moment');
    expect(formatRetryAfter(-5)).toBe('a moment');
    expect(formatRetryAfter(NaN)).toBe('a moment');
    expect(formatRetryAfter(Infinity)).toBe('a moment');
  });

  it('reports seconds under a minute', () => {
    expect(formatRetryAfter(1)).toBe('1 second');
    expect(formatRetryAfter(37)).toBe('37 seconds');
    // 59.4 ceils to 60 → rolls over to "1 minute" (not "60 seconds")
    expect(formatRetryAfter(59.4)).toBe('1 minute');
  });

  it('reports minutes under an hour, rounding up', () => {
    expect(formatRetryAfter(60)).toBe('1 minute');
    expect(formatRetryAfter(61)).toBe('2 minutes');
    expect(formatRetryAfter(120)).toBe('2 minutes');
    // 3599s ceils to 60min → rolls over to "1 hour" (not "60 minutes")
    expect(formatRetryAfter(3599)).toBe('1 hour');
  });

  it('reports hours under a day, rounding up', () => {
    expect(formatRetryAfter(3600)).toBe('1 hour');
    expect(formatRetryAfter(3601)).toBe('2 hours');
    expect(formatRetryAfter(7200)).toBe('2 hours');
  });

  it('reports "tomorrow" for ≥24h', () => {
    expect(formatRetryAfter(24 * 3600)).toBe('tomorrow');
    expect(formatRetryAfter(48 * 3600)).toBe('tomorrow');
  });
});
