/**
 * UI diagnostic signals — the shared contract between the web client
 * (emitter) and the API (`/v1/diagnostics/ui`, the sink).
 *
 * Why this exists
 * ───────────────
 * Postr is ~80% direct-to-Supabase: the browser reads and writes poster
 * documents without the Express API in the path. That means the backend
 * is structurally blind to almost everything a user experiences — a save
 * that never lands, an undo that does nothing, text silently clipped out
 * of a block. These signals are the narrow channel that makes those
 * failures observable server-side.
 *
 * Design rules
 * ────────────
 * - **One kind per distinct failure mode.** Nothing here is derivable
 *   from another signal. If a new event would be inferable from existing
 *   ones, extend an existing kind instead of adding a redundant one.
 * - **Measurements, never content.** Every field is a scalar count,
 *   pixel, millisecond or enum. No poster text, no block content, no
 *   file names, no tokens. A signal must be safe to log verbatim.
 * - **Emit on the anomaly, not the action.** These fire when something
 *   went wrong or a limit was reached — not on every keystroke, drag or
 *   save. Normal operation produces no traffic here.
 */

/** Where in the app a signal came from. Keeps signals attributable. */
export type DiagnosticSurface =
  'poster-editor' | 'dashboard' | 'share' | 'export' | 'import' | 'other';

/**
 * A persisted write did not land.
 *
 * Distinguishes a transient blip (which the editor recovers from) from a
 * persistent failure (which it does not) via `attempt` and `sinceFirstMs`.
 */
export interface AutosaveFailedSignal {
  kind: 'autosave_failed';
  /** HTTP status if there was a response; 0 for network-level failure. */
  status: number;
  /** 1-based retry counter for this run of consecutive failures. */
  attempt: number;
  /** ms since the first failure in this run — how long work has been unsaved. */
  sinceFirstMs: number;
  /** Short machine-readable reason, e.g. 'network', 'permission_denied'. */
  reason: string;
}

/**
 * The user pressed undo and the history stack had nothing left.
 *
 * The signal that matters is `evictedStructural`: history is capped, and
 * typing pushes one entry per keystroke, so a structural edit (a deleted
 * block) can be pushed out of the stack and become unrecoverable.
 */
export interface UndoExhaustedSignal {
  kind: 'undo_exhausted';
  /** Entries remaining when the user asked for one more (normally 0). */
  stackDepth: number;
  /** Consecutive undo presses that produced no change. */
  consecutiveNoops: number;
  /** True if a structural edit is known to have been evicted by the cap. */
  evictedStructural: boolean;
}

/**
 * Undo ran but the document did not change — the edit was never recorded.
 *
 * `action` says which interaction produced the un-undoable edit, which is
 * what turns this from "odd" into a bug report.
 */
export interface UndoNoopSignal {
  kind: 'undo_noop';
  action: 'group_move' | 'group_resize' | 'single_move' | 'text' | 'other';
  stackDepth: number;
}

/** Redo was unavailable immediately after an undo — the stack was cleared. */
export interface RedoUnavailableSignal {
  kind: 'redo_unavailable';
  afterAction: 'text' | 'move' | 'resize' | 'other';
}

/**
 * Layout defects found by a pre-flight sweep: text clipped inside its own
 * block, blocks overlapping, or blocks outside the page.
 *
 * These are the defects that survive to print, so `worstPx` carries the
 * magnitude — a 2px overlap and a 200px overlap are different bugs.
 */
export interface LayoutDefectSignal {
  kind: 'layout_defect';
  defect: 'text_overflow' | 'block_collision' | 'out_of_bounds';
  /** How many blocks are affected. */
  count: number;
  /** Worst single magnitude in CSS px (clipped height, overlap, spill). */
  worstPx: number;
  /** True when the defect was present at export/print time. */
  atExport: boolean;
}

/**
 * "Fit to screen" left part of the poster outside the viewport.
 *
 * Reported with the geometry needed to reproduce it, because the fit maths
 * depends on viewport width and on which side panels are open.
 */
export interface FitOverflowSignal {
  kind: 'fit_overflow';
  viewportW: number;
  /** Visible width of the canvas scroll area. */
  canvasW: number;
  posterW: number;
  /** Poster pixels past the right edge of the visible canvas. */
  hiddenRightPx: number;
  /** scrollWidth - clientWidth after fitting; 0 means it genuinely fit. */
  overflowXPx: number;
}

/**
 * A paste was normalised in a way that lost structure.
 *
 * Pasting from Word / Google Docs / the web delivers `text/html`; if block
 * elements are unwrapped without a separator, paragraphs merge and words
 * at the boundaries glue together. `separatorsLost` is that count.
 */
export interface PasteNormalizedSignal {
  kind: 'paste_normalized';
  flavor: 'html' | 'plain';
  /** Block-level elements in the source (p, div, li, br). */
  sourceBlocks: number;
  /** Line breaks present in the result. */
  resultBreaks: number;
  /** sourceBlocks - resultBreaks: paragraph boundaries silently dropped. */
  separatorsLost: number;
  charsIn: number;
}

/**
 * An unhandled client error, including anything caught by an error
 * boundary. The user sees a generic message; the detail lands here.
 */
export interface ClientErrorSignal {
  kind: 'client_error';
  name: string;
  /** Error message. Truncated by the logger; never include user content. */
  message: string;
  /** Component or route that failed, e.g. 'EditorErrorBoundary'. */
  where: string;
  /** True when the UI dead-ends with no recovery control offered. */
  deadEnd: boolean;
}

/**
 * The session is present but not usable — e.g. a valid JWT whose user has
 * been deleted, which the anonymous-cleanup job produces in production.
 */
export interface SessionInvalidSignal {
  kind: 'session_invalid';
  reason: 'permission_denied' | 'no_user' | 'expired' | 'other';
  /** Route the user was on when it surfaced. */
  route: string;
  /** True if the client recovered by re-authenticating. */
  recovered: boolean;
}

/** The same poster is open in more than one tab (last-write-wins risk). */
export interface DuplicateTabSignal {
  kind: 'duplicate_tab';
  state: 'detected' | 'cleared';
}

export type DiagnosticSignal =
  | AutosaveFailedSignal
  | UndoExhaustedSignal
  | UndoNoopSignal
  | RedoUnavailableSignal
  | LayoutDefectSignal
  | FitOverflowSignal
  | PasteNormalizedSignal
  | ClientErrorSignal
  | SessionInvalidSignal
  | DuplicateTabSignal;

export type DiagnosticSignalKind = DiagnosticSignal['kind'];

/** One reported event: a signal plus the context needed to act on it. */
export interface DiagnosticEvent {
  signal: DiagnosticSignal;
  surface: DiagnosticSurface;
  /** Client timestamp (epoch ms). The server records its own as well. */
  at: number;
  /**
   * Poster this concerns, when applicable. A UUID only — it identifies a
   * row the reporting user already owns, and carries no content.
   */
  posterId?: string;
}

/** Batch envelope posted to `/v1/diagnostics/ui`. */
export interface DiagnosticBatch {
  events: DiagnosticEvent[];
  /** App build identifier, so signals can be tied to a release. */
  appVersion?: string;
}

/** Maximum events accepted in a single batch. */
export const DIAGNOSTIC_BATCH_MAX = 20;

/**
 * The part of a signal that distinguishes one problem from another of the
 * same kind, used to build a dedup signature.
 *
 * Lives here and is used by BOTH the client emitter and the server ingest,
 * so the two cannot drift into disagreeing about what counts as "the same
 * signal".
 *
 * Deliberately excludes magnitudes (pixels, durations): a value that
 * drifts by one pixel per frame must still collapse. It DOES include
 * `name` for `client_error`, so a TypeError and a RangeError from the same
 * component are never folded into one another.
 */
export function diagnosticSignatureDetail(signal: DiagnosticSignal): string {
  switch (signal.kind) {
    case 'layout_defect':
      return signal.defect;
    case 'undo_noop':
      return signal.action;
    case 'redo_unavailable':
      return signal.afterAction;
    case 'autosave_failed':
    case 'session_invalid':
      return signal.reason;
    case 'duplicate_tab':
      return signal.state;
    case 'paste_normalized':
      return signal.flavor;
    case 'client_error':
      return `${signal.where}|${signal.name}`;
    // fit_overflow and undo_exhausted carry no sub-type: one per poster is
    // the right granularity for both.
    default:
      return '';
  }
}
