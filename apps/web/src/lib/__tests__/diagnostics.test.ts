/**
 * The emitter's headline contract is that it can never make things worse:
 * a call site in the editor must not throw, and a diagnostics outage must
 * not surface as an editor error. These tests pin that.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  reportUiSignal,
  flushUiSignals,
  __resetUiSignals,
} from '../diagnostics';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'tok' } },
      })),
    },
  },
}));

describe('reportUiSignal', () => {
  beforeEach(() => {
    __resetUiSignals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetUiSignals();
  });

  /** Let flush()'s getSession + fetch promise chain settle. */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('does not throw when fetch rejects', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect(() =>
      reportUiSignal({ kind: 'duplicate_tab', state: 'detected' }),
    ).not.toThrow();
    expect(() => flushUiSignals()).not.toThrow();
  });

  it('does not throw when handed a malformed signal', () => {
    expect(() => reportUiSignal(undefined as unknown as never)).not.toThrow();
  });

  it('returns synchronously without awaiting the network', () => {
    const fetchMock = vi.fn(() => new Promise(() => {})); // never settles
    vi.stubGlobal('fetch', fetchMock);
    reportUiSignal({ kind: 'duplicate_tab', state: 'detected' });
    // Queued only — the call site pays for an array push, not a request.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('suppresses an identical signal across flushes', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);

    reportUiSignal({ kind: 'duplicate_tab', state: 'detected' });
    flushUiSignals();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    reportUiSignal({ kind: 'duplicate_tab', state: 'detected' });
    flushUiSignals();
    await settle();

    // A condition that persists must not re-post every flush window.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not treat two different error types as the same signal', async () => {
    const sigs = new Set<string>();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        events: Array<{ signal: { name: string } }>;
      };
      body.events.forEach((e) => sigs.add(e.signal.name));
      return Promise.resolve({ ok: true } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    reportUiSignal({
      kind: 'client_error',
      name: 'TypeError',
      message: 'x',
      where: 'Boundary',
      deadEnd: false,
    });
    reportUiSignal({
      kind: 'client_error',
      name: 'RangeError',
      message: 'y',
      where: 'Boundary',
      deadEnd: false,
    });
    flushUiSignals();
    await settle();

    expect(sigs).toEqual(new Set(['TypeError', 'RangeError']));
  });
});
