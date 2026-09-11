/**
 * Structured logging for the API.
 *
 * One place writes to stdout, so log shape stays consistent and grep /
 * Render's log search keep working. Every record is a single line of
 * JSON — Render captures stdout verbatim, and one-line-per-event is what
 * makes `grep '"event":"ui.autosave_failed"'` viable in their viewer.
 *
 * Design notes
 * ────────────
 * - **One line per event, never per stage.** Multi-stage work (a save, a
 *   critique) logs once at the outcome with a `ms` duration, not once per
 *   step. Redundant lines are the main way a log becomes unreadable.
 * - **Explicit fields only.** Nothing is auto-serialised off a request or
 *   a user object, so poster content, tokens and emails cannot leak in by
 *   accident. Callers pass the handful of scalars they mean to record.
 * - **Bounded.** Strings are truncated and objects are shallow-capped so a
 *   pathological payload cannot flood the log budget.
 * - The legacy `[module.route] message` console calls elsewhere in this
 *   service still work; this module is what new code should use.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Longest string kept for any single field value. */
export const MAX_STRING_LEN = 300;
/** Most fields kept on one record, after which the rest are dropped. */
export const MAX_FIELDS = 40;

export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

export interface LoggerOptions {
  /** Minimum level emitted. Defaults to LOG_LEVEL env, else 'info'. */
  level?: LogLevel;
  /** Sink for finished lines. Defaults to stdout. Injected in tests. */
  write?: (line: string) => void;
  /** Clock injection for tests. */
  now?: () => number;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Current minimum level — exposed so callers can skip expensive prep. */
  readonly level: LogLevel;
}

function parseLevel(raw: string | undefined): LogLevel | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return v === 'debug' || v === 'info' || v === 'warn' || v === 'error'
    ? v
    : null;
}

/**
 * Clamp one field value into something safe to serialise.
 *
 * Non-finite numbers (NaN, Infinity) become null rather than serialising
 * as `null` implicitly via JSON.stringify, so the intent is explicit in
 * the output.
 */
function clampValue(value: LogValue): LogValue {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LEN
      ? `${value.slice(0, MAX_STRING_LEN)}…`
      : value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  return value;
}

/**
 * Drop undefined fields and clamp the rest. Undefined is dropped rather
 * than emitted as null so optional context does not pad every record with
 * empty keys.
 */
function clampFields(fields: LogFields | undefined): LogFields {
  if (!fields) return {};
  const out: LogFields = {};
  let count = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (count >= MAX_FIELDS) break;
    out[key] = clampValue(value);
    count += 1;
  }
  return out;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? parseLevel(process.env.LOG_LEVEL) ?? 'info';
  const now = options.now ?? Date.now;
  const write =
    options.write ??
    ((line: string) => {
      process.stdout.write(`${line}\n`);
    });

  const min = LEVEL_ORDER[level];

  const emit = (lvl: LogLevel, event: string, fields?: LogFields) => {
    if (LEVEL_ORDER[lvl] < min) return;
    const record = {
      ts: new Date(now()).toISOString(),
      level: lvl,
      event,
      ...clampFields(fields),
    };
    // The write itself is inside the try, not just the serialise: stdout
    // on Render is a pipe, and a closed pipe throws EPIPE. Callers include
    // a res.on('finish') listener, where an uncaught throw would take down
    // the process rather than fail one request.
    try {
      write(JSON.stringify(record));
    } catch {
      try {
        write(
          JSON.stringify({
            ts: record.ts,
            level: lvl,
            event,
            log_error: 'emit_failed',
          }),
        );
      } catch {
        // Logging must never be the reason a request or process dies.
      }
    }
  };

  return {
    level,
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}

/** Shared instance for production code paths. */
export const logger = createLogger();
