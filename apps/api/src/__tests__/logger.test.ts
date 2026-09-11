import { describe, it, expect } from 'vitest';
import { createLogger, MAX_STRING_LEN } from '../logger.js';

function capture(level?: 'debug' | 'info' | 'warn' | 'error') {
  const lines: string[] = [];
  const log = createLogger({
    level,
    write: (l) => lines.push(l),
    now: () => 1_700_000_000_000,
  });
  return { log, lines, parsed: () => lines.map((l) => JSON.parse(l)) };
}

describe('createLogger', () => {
  it('emits one JSON line per event with ts, level and event', () => {
    const { log, parsed } = capture();
    log.info('http.request', { status: 200 });
    const [rec] = parsed();
    expect(rec).toMatchObject({
      level: 'info',
      event: 'http.request',
      status: 200,
    });
    expect(rec.ts).toBe('2023-11-14T22:13:20.000Z');
  });

  it('emits exactly one line per call', () => {
    const { log, lines } = capture();
    log.info('a');
    log.warn('b');
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => !l.includes('\n'))).toBe(true);
  });

  it('filters below the configured level', () => {
    const { log, lines } = capture('warn');
    log.debug('skip.me');
    log.info('skip.me.too');
    log.warn('keep');
    log.error('keep');
    expect(lines).toHaveLength(2);
  });

  it('truncates long strings so one field cannot flood the log', () => {
    const { log, parsed } = capture();
    log.error('ui.client_error', { message: 'x'.repeat(5000) });
    const [rec] = parsed();
    expect(rec.message.length).toBe(MAX_STRING_LEN + 1); // + ellipsis
    expect(rec.message.endsWith('…')).toBe(true);
  });

  it('drops undefined fields rather than emitting empty keys', () => {
    const { log, parsed } = capture();
    log.info('e', { present: 1, absent: undefined });
    const [rec] = parsed();
    expect(rec).toHaveProperty('present');
    expect(rec).not.toHaveProperty('absent');
  });

  it('renders non-finite numbers as null instead of crashing JSON', () => {
    const { log, parsed } = capture();
    log.info('e', { ratio: NaN, size: Infinity });
    const [rec] = parsed();
    expect(rec.ratio).toBeNull();
    expect(rec.size).toBeNull();
  });
});
