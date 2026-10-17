import { describe, it, expect } from 'vitest';
import { isMissingObjectError, isTransientStorageError } from '../posterImages';

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

// Record 35, correction 5 (the lead's rule on the final check's F35-FC-2): a
// pasted image or a ⌘D clone is emptied only when storage says its own-folder
// source does not exist. storage-js reports storage's body
// {"statusCode":"404","error":"not_found","message":"Object not found"} (sent
// with HTTP 400) as { statusCode: '404', message: 'Object not found' }.
describe('isMissingObjectError', () => {
  it('storage\'s answer for a missing object: statusCode 404 with its "not found" message', () => {
    expect(isMissingObjectError({ statusCode: '404', message: 'Object not found' })).toBe(true);
    expect(isMissingObjectError({ statusCode: 404, message: 'Object not found' })).toBe(true);
    // Older storage: transformPostgrestError's wording.
    expect(isMissingObjectError({ statusCode: '404', message: 'The resource was not found' })).toBe(true);
  });

  it('not a clear "missing": a refusal not about the file, storage busy, or a 404 that is not storage\'s answer about the object', () => {
    expect(isMissingObjectError({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isMissingObjectError({ statusCode: '400', message: 'jwt expired' })).toBe(false);
    expect(isMissingObjectError({ statusCode: '409', message: 'The resource already exists' })).toBe(false);
    expect(isMissingObjectError({ statusCode: '503', message: '503 Service Unavailable' })).toBe(false);
    expect(isMissingObjectError({ message: 'Failed to fetch' })).toBe(false);
    // A page that is not JSON (a gateway's or a router's 404): storage-js's own message, or the status text.
    expect(isMissingObjectError({ statusCode: '404', message: 'HTTP 404 error' })).toBe(false);
    expect(isMissingObjectError({ statusCode: '404', message: 'Not Found' })).toBe(false);
    expect(isMissingObjectError({ statusCode: '404', message: 'Bucket not found' })).toBe(false);
    expect(isMissingObjectError({ message: 'Object not found' })).toBe(false);
    expect(isMissingObjectError({})).toBe(false);
  });
});
