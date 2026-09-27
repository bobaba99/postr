/**
 * "Full edited code" — the pasted script with the recommended base_size
 * applied and, when the script never saves its figure, a save call
 * appended.
 *
 * The appended save call carries the canvas the check was SCORED
 * against (`params.canvasWidth/Height`): with no ggsave()/figsize in
 * the code that is the typed print size on the public page, or the
 * figure-preview overlay in the editor. A hardcoded size here would
 * hand back a script whose canvas has nothing to do with the base_size
 * it recommends — the exact failure the check exists to prevent.
 */
import { applyFontFixes, argValueEnd, maskCodeForRewrite, maskComments, type FigureParams } from './readability';

/** "24", "23.4" — never "24.0" or float noise like 16.549999. */
function formatInches(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Patterns locate the KEY only. The value that follows is delimited by a
// balanced scan (`argValueEnd`), never by a character class: `[^,)\n]+`
// stopped at the first `)` of `if (big) 20 else 9`, and the call
// alternative matched only `max(bs, 8)` of `max(bs, 8) * 1.2`, leaving
// `* 1.2` behind so the emitted script ran and rendered 38.4pt where the
// check had scored 32.
const R_BASE_SIZE_KEY = /base_size\s*=\s*/;
const R_THEME_CALL = /(theme_\w+\s*\()(\s*\))?/;
const PY_FONT_SIZE_KEY = /rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*/;
/** `plt.rcParams.update({... 'font.size': N ...})` — the dict form. */
const PY_FONT_SIZE_UPDATE_KEY = /rcParams\s*\.\s*update\s*\((?:[^()]|\([^()]*\))*?['"]font\.size['"]\s*:\s*/;
const PY_FONT_SCALE = /font_scale\s*=\s*[\d.]+/;

/**
 * Replace the VALUE that follows each match of `keyRe`, in live code only.
 *
 * Matching happens in a copy with comments AND string contents blanked, so
 * neither can attract an edit; the output is spliced from the ORIGINAL, so
 * comments and string bodies survive byte-for-byte. `stop` bounds the
 * value — `argValueEnd` for a call argument, end-of-statement for Python.
 *
 * Returns null when there is no live match, so callers fall through to
 * their add-a-setting branch.
 */
function replaceValue(
  code: string,
  keyRe: RegExp,
  value: string,
  stop: (masked: string, from: number) => number,
  all = false,
): string | null {
  // TWO masks, because they answer different questions.
  //
  // `locate` hides comments but KEEPS string contents — the key itself
  // contains a literal (`rcParams['font.size']`), so blanking string
  // bodies makes the key unfindable.
  //
  // `bounds` hides both, and is what delimits the VALUE and decides
  // whether a match is live: a key that appears inside a string has its
  // characters blanked there, so comparing one character against the
  // original tells the real assignment apart from a mention of it in
  // prose — which is what stopped `note = "try rcParams['font.size'] = 30
  // next time"` from having its closing quote eaten.
  const locate = maskComments(code);
  const bounds = maskCodeForRewrite(code);
  // ALWAYS global: iteration is controlled by `break`, not by the flag.
  // Without `g`, `exec` restarts from 0 every call, so skipping a match
  // with `continue` spins forever.
  const g = new RegExp(keyRe.source, 'g');
  let out = '';
  let last = 0;
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = g.exec(locate)) !== null) {
    if (bounds[m.index] !== code[m.index]) continue;   // a mention in a string, not an assignment
    const keyEnd = m.index + m[0].length;
    let valueEnd = stop(bounds, keyEnd);
    // Trim trailing blanks off the value span. A comment is blanked to
    // spaces by the mask, so a span running to the line end would consume
    // it and the replacement would delete the user's note — which the
    // panel's own contract says must survive.
    while (valueEnd > keyEnd && /\s/.test(bounds[valueEnd - 1]!)) valueEnd--;
    if (valueEnd <= keyEnd) continue;
    found = true;
    // Key text comes from the ORIGINAL, not the mask: the dict-form key
    // can span newlines and comments, and splicing the masked copy
    // deleted them.
    out += code.slice(last, m.index) + code.slice(m.index, keyEnd) + value;
    last = valueEnd;
    if (!all) break;
    g.lastIndex = valueEnd;
  }
  return found ? out + code.slice(last) : null;
}

/** End of a Python statement value: `;`, a comment, or the line end. */
function pyValueEnd(masked: string, from: number): number {
  for (let i = from; i < masked.length; i++) {
    const ch = masked[i]!;
    if (ch === '\n' || ch === ';' || ch === '#') return i;
    // A backslash continuation means the value carries on to the next line.
    if (ch === '\\' && masked[i + 1] === '\n') i++;
  }
  return masked.length;
}

function fixR(code: string, params: FigureParams, suggested: number): string {
  const replaced = replaceValue(code, R_BASE_SIZE_KEY, String(suggested), argValueEnd, true);
  const added = replaced ?? addRThemeArg(code, suggested);
  return ensureRSave(added, params);
}

/** No `base_size` anywhere: put one in a theme_*() call, or add a theme. */
function addRThemeArg(code: string, suggested: number): string {
  const masked = maskComments(code);
  const m = masked.match(R_THEME_CALL);
  if (m && m.index !== undefined) {
    const at = m.index + m[1]!.length;
    return m[2]
      ? `${code.slice(0, at)}base_size = ${suggested}${code.slice(at + m[2].length - 1)}`
      : `${code.slice(0, at)}base_size = ${suggested}, ${code.slice(at)}`;
  }
  // No theme call at all. The old fallback appended to the END of the
  // script — normally after ggsave(), where `ggsave(...) + theme_minimal()`
  // evaluates cleanly, returns NULL and attaches nothing. Measured on a
  // 17-script corpus, 8 produced exactly that silent no-op. Attach to the
  // last line carrying code BEFORE ggsave instead, the same rule
  // applyFontFixes uses.
  return appendToPlotExpression(code, `theme_minimal(base_size = ${suggested})`);
}

/**
 * Join `snippet` to the end of the plot expression with ` +`, before any
 * ggsave(), splitting the line at the end of its CODE so a trailing
 * comment stays a comment.
 */
function appendToPlotExpression(code: string, snippet: string): string {
  const lines = code.split('\n');
  const maskedLines = maskCodeForRewrite(code).split('\n');
  let at = lines.length - 1;
  const ggsaveAt = maskedLines.findIndex((l) => /\bggsave\s*\(/.test(l));
  if (ggsaveAt > 0) at = ggsaveAt - 1;
  while (at > 0 && maskedLines[at]!.trim() === '') at--;
  const codeEnd = maskedLines[at]!.trimEnd().length;
  lines[at] = lines[at]!.slice(0, codeEnd) + ' +' + lines[at]!.slice(codeEnd) + '\n  ' + snippet;
  return lines.join('\n');
}

/**
 * Append a ggsave() carrying the canvas the check was SCORED against,
 * when the script never saves its figure. Shared by the base_size path
 * and the targeted path — a script returned without it would be scored
 * at one size and rendered at another, which is the failure the check
 * exists to prevent.
 */
function ensureRSave(code: string, params: FigureParams): string {
  if (/ggsave/.test(code)) return code;
  const w = formatInches(params.canvasWidth);
  const h = formatInches(params.canvasHeight);
  return `${code.trimEnd()}\n\nggsave("poster_figure.png", width = ${w}, height = ${h}, dpi = 300)`;
}

function fixPython(code: string, params: FigureParams, suggested: number): string {
  const hasFigsize = /figsize\s*=/.test(code);
  const figsizeLine = `plt.rcParams['figure.figsize'] = (${formatInches(params.canvasWidth)}, ${formatInches(params.canvasHeight)})`;

  let fixed: string;
  const itemForm = replaceValue(code, PY_FONT_SIZE_KEY, String(suggested), pyValueEnd);
  const dictForm = itemForm
    ? null
    : replaceValue(code, PY_FONT_SIZE_UPDATE_KEY, String(suggested), (masked, from) =>
        argValueEnd(masked, from));

  if (itemForm) {
    fixed = itemForm;
    if (!hasFigsize) {
      // Right after the font.size line, so the two rcParams read as a pair.
      fixed = fixed.replace(/^(.*rcParams\s*\[\s*['"]font\.size['"]\s*\].*)$/m, `$1\n${figsizeLine}`);
    }
  } else if (dictForm) {
    // `rcParams.update({...})` already carries the size; edit it in place
    // rather than prepending a second, conflicting `font.size`.
    fixed = dictForm;
    if (!hasFigsize) {
      fixed = `import matplotlib.pyplot as plt\n${figsizeLine}\n\n${fixed}`;
    }
  } else if (PY_FONT_SCALE.test(code)) {
    fixed = code.replace(PY_FONT_SCALE, `font_scale=${(suggested / 10).toFixed(1)}`);
    if (!hasFigsize) fixed = `import matplotlib.pyplot as plt\n${figsizeLine}\n\n${fixed}`;
  } else {
    const header = [
      'import matplotlib.pyplot as plt',
      `plt.rcParams['font.size'] = ${suggested}`,
      ...(hasFigsize ? [] : [figsizeLine]),
    ].join('\n');
    fixed = `${header}\n\n${code}`;
  }

  return ensurePySave(fixed);
}

/** Python counterpart of `ensureRSave`. */
function ensurePySave(code: string): string {
  if (/savefig/.test(code)) return code;
  return `${code.trimEnd()}\n\nplt.savefig("poster_figure.png", dpi=300, bbox_inches="tight")`;
}

/**
 * "Full edited code" for the TARGETED advice: the user's script with the
 * per-element sizes applied, plus the same save call the base_size path
 * appends when the script has none.
 *
 * This is what the copy button hands over. A theme() fragment would
 * leave the user to work out where it goes, and pasting it below
 * ggsave() produces code that runs and changes nothing.
 */
export function generateTargetedFullFix(
  code: string,
  params: FigureParams,
  fontSnippet: string | null,
): string {
  const withFixes = applyFontFixes(code, params.language, fontSnippet);
  return params.language === 'r'
    ? ensureRSave(withFixes, params)
    : ensurePySave(withFixes);
}

export function generateFullFix(
  code: string,
  params: FigureParams,
  suggested: number | null,
): string {
  // `null` means there is no base_size worth recommending — every element
  // is sized explicitly, so base_size governs nothing (FR7). Returning the
  // code unchanged is the honest answer; the panel shows per-element
  // targets instead of a "full fix" that would fix nothing.
  if (suggested === null) return code;
  return params.language === 'r' ? fixR(code, params, suggested) : fixPython(code, params, suggested);
}
