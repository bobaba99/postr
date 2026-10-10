/**
 * The plot checker's source scanners, shared by its R and Python readers
 * and by the fix that rewrites a script: comments and string contents
 * blanked so an offset found in the masked copy is valid in the original.
 * Moved out of readability.ts unchanged (fix 13b), which re-exports what it
 * exported; part 1's call-argument walks (extractCallArgs,
 * extractAllCallArgs, topLevelArgs, argValueEnd), which nothing calls since
 * the rule table (readabilityCalls.ts), were removed in review round 1
 * (P13B-R1-15).
 */

// ── Comment stripping ────────────────────────────────────────────────

/**
 * Remove `#` comments from R or Python source, leaving string literals
 * untouched.
 *
 * This CANNOT be a regex. `/#.*$/gm` deletes the rest of the line from
 * inside a hex colour — `c("#FF0000", '#00FF00')` in ggplot code, or any
 * Python string containing `#` — taking real arguments with it. So we
 * scan characters and track quote state, including Python triple quotes.
 *
 * Newlines are preserved (a stripped comment leaves its `\n`) so line
 * numbers still line up with what the user sees in the editor.
 *
 * Only the PARSERS see the stripped source; the panel's "full edited
 * code" output rewrites the user's ORIGINAL text, so their comments
 * survive.
 *
 * Known limitation, accepted: a `figsize=` inside a triple-quoted
 * docstring is still read, because that is a string literal and not a
 * comment. Blanking string CONTENTS is not an option — `units = "cm"`
 * and `'font.size'` are both parsed out of string literals.
 */
export function stripComments(code: string): string {
  return scanComments(code, false);
}

/**
 * Same as `stripComments`, but comment characters become SPACES instead
 * of disappearing, so the result is character-for-character the same
 * length as the input and any index found in it is valid in the original.
 *
 * That is what `stripComments` cannot give you: choosing an insertion
 * point in stripped code and applying it to the original lands somewhere
 * else entirely. Insertion points were instead chosen from raw text, so a
 * commented-out `theme_minimal(` attracted the edit and the joining `+`
 * was written inside a `#` comment — valid-looking output that changes
 * nothing when run.
 */
export function maskComments(code: string): string {
  return scanComments(code, true);
}

/**
 * Comments AND string CONTENTS blanked (delimiters kept), same length.
 *
 * For the REWRITER only. The parsers must keep reading inside literals —
 * `units = "cm"` and `'font.size'` are how they work — but a rewriter
 * must never write there. Loosening the value patterns to match arbitrary
 * text turned that distinction from academic into a script that will not
 * parse: `msg <- "set base_size = 30 for posters"` had its closing quote
 * eaten, and the Python equivalent produced an unterminated string.
 */
export function maskCodeForRewrite(code: string): string {
  const noComments = scanComments(code, true);
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i]!;
    if (quote) {
      if (quote.length === 3 && noComments.startsWith(quote, i)) {
        out += quote; i += 2; quote = null; continue;
      }
      if (ch === '\\') { out += '  '; i++; continue; }
      if (ch === quote) { out += ch; quote = null; continue; }
      out += ch === '\n' ? '\n' : ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = ch + ch + ch;
      if (noComments.startsWith(triple, i)) { quote = triple; out += triple; i += 2; continue; }
      quote = ch;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function scanComments(code: string, blank: boolean): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;

    if (quote) {
      if (quote.length === 3) {
        if (code.startsWith(quote, i)) { out += quote; i += 2; quote = null; continue; }
        out += ch;
        continue;
      }
      if (ch === '\\') { out += ch + (code[i + 1] ?? ''); i++; continue; }
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const triple = ch + ch + ch;
      if (code.startsWith(triple, i)) { quote = triple; out += triple; i += 2; continue; }
      quote = ch;
      out += ch;
      continue;
    }

    if (ch === '#') {
      // Skip to end of line. `i` lands ON the newline, which we emit and
      // let the loop's `i++` step past — consuming it here as well would
      // silently drop the first character of the next line.
      const start = i;
      while (i < code.length && code[i] !== '\n') i++;
      if (blank) {
        // Exactly as many characters as were consumed, so offsets hold.
        out += ' '.repeat(i - start);
        if (i < code.length) out += '\n';
      } else {
        out += '\n';
      }
      continue;
    }

    out += ch;
  }
  return out;
}
