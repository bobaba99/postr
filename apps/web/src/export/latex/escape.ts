/**
 * LaTeX escaping — a correctness AND security surface (plan §6).
 *
 * Poster text is user content going into a language with command
 * execution (`\write18`, `\input`, catcode tricks). Every character
 * that LaTeX treats as syntax is replaced with its literal-text
 * command, char by char — a single pass over the string, so escape
 * output can never itself be re-interpreted (no double-escaping,
 * no partial regex passes).
 */

const LATEX_CHAR_MAP: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '$': '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  '_': '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
  // Brackets are contextually special: after the `\\` line breaks and
  // `\item` commands we emit, a leading `[` opens an optional argument
  // ("[1] Smith" after `\\` parses as \\[<dimen>] → "Missing number"
  // compile error). `{[}` / `{]}` render identically and stay inert.
  '[': '{[}',
  ']': '{]}',
};

/**
 * Escape user text for use in LaTeX body content. Also strips
 * ASCII control characters (except tab), which have no place in
 * poster text and can confuse TeX engines.
 */
export function escapeLatex(text: string): string {
  let out = '';
  for (const ch of text) {
    const mapped = LATEX_CHAR_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code < 0x20 && ch !== '\t') continue; // \n never reaches here — runs are split upstream
    if (code === 0x7f) continue;
    out += ch;
  }
  return out;
}

/**
 * True when a string is safe to interpolate into a LaTeX command
 * ARGUMENT position we generate ourselves (color names, lengths).
 * Never used on user content — user content always goes through
 * escapeLatex into body positions only.
 */
export function isSafeLatexIdentifier(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(value);
}
