/**
 * Rolling buffer of recent console messages.
 *
 * Patches `console.error`, `console.warn`, and `console.log` once at
 * boot to keep the most recent 200 entries in memory. The Send
 * Feedback flow reads `getCapturedLog()` and attaches it to the
 * report so we can diagnose silent failures (e.g., import vision
 * call failed because of a timeout) without asking the user for
 * console screenshots.
 *
 * Privacy: this is a TAB-LOCAL ring. Nothing is sent anywhere
 * automatically — the user has to click "Send feedback" before any
 * captured line leaves their browser, and the modal previews the
 * payload before submit so they can see what's included.
 */

const MAX_ENTRIES = 200;
const MAX_LINE_LEN = 600;

interface CapturedEntry {
  level: 'log' | 'warn' | 'error';
  ts: number;
  message: string;
}

const buffer: CapturedEntry[] = [];
let installed = false;

function safeStringify(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack ?? `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function record(level: CapturedEntry['level'], args: unknown[]) {
  const message = args.map(safeStringify).join(' ').slice(0, MAX_LINE_LEN);
  buffer.push({ level, ts: Date.now(), message });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function installConsoleCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: unknown[]) => {
    record('log', args);
    origLog.apply(console, args as []);
  };
  console.warn = (...args: unknown[]) => {
    record('warn', args);
    origWarn.apply(console, args as []);
  };
  console.error = (...args: unknown[]) => {
    record('error', args);
    origError.apply(console, args as []);
  };

  window.addEventListener('error', (e) => {
    record('error', [`window.onerror: ${e.message} @ ${e.filename}:${e.lineno}`]);
  });
  window.addEventListener('unhandledrejection', (e) => {
    record('error', [`unhandledrejection: ${safeStringify(e.reason)}`]);
  });
}

/** Returns the captured log as a single text blob, newest first. */
export function getCapturedLog(): string {
  return buffer
    .slice()
    .reverse()
    .map(
      (e) =>
        `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] ${e.message}`,
    )
    .join('\n');
}

/** Number of entries currently held — used by the modal preview. */
export function getCapturedCount(): number {
  return buffer.length;
}
