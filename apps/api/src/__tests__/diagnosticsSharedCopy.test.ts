/**
 * The API keeps runtime copies of DIAGNOSTIC_BATCH_MAX and
 * diagnosticSignatureDetail (it cannot load @postr/shared's values at
 * runtime; see sharedTypeOnly.test.ts). The client emitter uses the shared
 * originals, so the two must agree: a signal the client and the server
 * sign differently would never be deduplicated. Tests run on the TS source,
 * so here the originals CAN be imported and compared.
 */
import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_BATCH_MAX as SHARED_BATCH_MAX,
  diagnosticSignatureDetail as sharedDetail,
  type DiagnosticSignal,
} from '@postr/shared';
import { DIAGNOSTIC_BATCH_MAX, diagnosticSignatureDetail } from '../diagnostics.js';

/** One signal of every kind: a kind added to the shared union fails the typecheck here until it is listed. */
const oneOfEachKind: { [K in DiagnosticSignal['kind']]: Extract<DiagnosticSignal, { kind: K }> } = {
  autosave_failed: { kind: 'autosave_failed', status: 500, attempt: 2, sinceFirstMs: 4000, reason: 'network' },
  undo_exhausted: { kind: 'undo_exhausted', stackDepth: 50, consecutiveNoops: 3, evictedStructural: true },
  undo_noop: { kind: 'undo_noop', action: 'group_move', stackDepth: 4 },
  redo_unavailable: { kind: 'redo_unavailable', afterAction: 'text' },
  layout_defect: { kind: 'layout_defect', defect: 'text_overflow', count: 2, worstPx: 12, atExport: false },
  fit_overflow: { kind: 'fit_overflow', viewportW: 1280, canvasW: 1100, posterW: 1150, hiddenRightPx: 36, overflowXPx: 36 },
  paste_normalized: { kind: 'paste_normalized', flavor: 'html', sourceBlocks: 3, resultBreaks: 2, separatorsLost: 1, charsIn: 400 },
  client_error: { kind: 'client_error', name: 'TypeError', message: 'x is undefined', where: 'PosterEditor', deadEnd: false },
  session_invalid: { kind: 'session_invalid', reason: 'expired', route: '/p/1', recovered: true },
  duplicate_tab: { kind: 'duplicate_tab', state: 'detected' },
};

describe("the API's runtime copies of the shared diagnostics values", () => {
  it('accept the same batch size', () => {
    expect(DIAGNOSTIC_BATCH_MAX).toBe(SHARED_BATCH_MAX);
  });

  it.each(Object.values(oneOfEachKind))('sign a $kind signal as the client does', (signal) => {
    expect(diagnosticSignatureDetail(signal)).toBe(sharedDetail(signal));
  });
});
