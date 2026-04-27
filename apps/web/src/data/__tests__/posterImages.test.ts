import { describe, it, expect } from 'vitest';
import { isTransientStorageError } from '../posterImages';

describe('isTransientStorageError', () => {
  describe('statusCode-driven (preferred)', () => {
    it('returns true for 5xx', () => {
      expect(isTransientStorageError({ statusCode: 500 })).toBe(true);
      expect(isTransientStorageError({ statusCode: 502 })).toBe(true);
      expect(isTransientStorageError({ statusCode: 504 })).toBe(true);
      expect(isTransientStorageError({ statusCode: '503' })).toBe(true);
    });

    it('returns true for 408 / 425 / 429 (request-timeout / too-early / rate-limit)', () => {
      expect(isTransientStorageError({ statusCode: 408 })).toBe(true);
      expect(isTransientStorageError({ statusCode: 425 })).toBe(true);
      expect(isTransientStorageError({ statusCode: 429 })).toBe(true);
    });

    it('returns false for other 4xx (permanent failures)', () => {
      expect(isTransientStorageError({ statusCode: 400 })).toBe(false);
      expect(isTransientStorageError({ statusCode: 401 })).toBe(false);
      expect(isTransientStorageError({ statusCode: 403 })).toBe(false);
      expect(isTransientStorageError({ statusCode: 404 })).toBe(false);
      expect(isTransientStorageError({ statusCode: 413 })).toBe(false);
    });
  });

  describe('message-driven fallback', () => {
    it('matches gateway-style errors', () => {
      expect(isTransientStorageError({ message: '504 Gateway Timeout' })).toBe(true);
      expect(isTransientStorageError({ message: 'Bad Gateway' })).toBe(true);
      expect(isTransientStorageError({ message: 'request timeout' })).toBe(true);
    });

    it('matches per-browser fetch failures', () => {
      // Chrome / Edge
      expect(isTransientStorageError({ message: 'TypeError: Failed to fetch' })).toBe(true);
      // Safari
      expect(isTransientStorageError({ message: 'Load failed' })).toBe(true);
      // Generic
      expect(isTransientStorageError({ message: 'NetworkError' })).toBe(true);
      expect(isTransientStorageError({ message: 'fetch failed' })).toBe(true);
    });

    it('returns false for permanent errors with no statusCode', () => {
      expect(isTransientStorageError({ message: 'invalid api key' })).toBe(false);
      expect(isTransientStorageError({ message: 'bucket not found' })).toBe(false);
      expect(isTransientStorageError({})).toBe(false);
      expect(isTransientStorageError({ message: undefined })).toBe(false);
    });
  });
});
