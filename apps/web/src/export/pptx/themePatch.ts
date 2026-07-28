/**
 * Rewrites `ppt/theme/theme1.xml`'s colour scheme in finished .pptx
 * bytes.
 *
 * pptxgenjs cannot express theme colours (see `masters.ts` →
 * `applyThemeColors` for the why). Everything else about the deck is
 * produced by the library; this pass touches exactly one part, and
 * only ever the `<a:clrScheme>` element inside it.
 *
 * Every failure mode returns the ORIGINAL bytes. A poster that
 * exports with Office swatches is a cosmetic shortfall; a poster that
 * fails to export, or exports a file PowerPoint refuses to open, is
 * not acceptable — so nothing here is allowed to throw outward.
 */
import { unzipSync, zipSync } from 'fflate';
import { applyThemeColors, type MasterPalette } from './masters';

const THEME_PART = 'ppt/theme/theme1.xml';

/**
 * Returns the deck with the poster's palette as its theme colours, or
 * the untouched input if the theme part is missing or unrecognised.
 */
export function patchThemeColors(bytes: Uint8Array, palette: MasterPalette): Uint8Array {
  try {
    const entries = unzipSync(bytes);
    const theme = entries[THEME_PART];
    if (!theme) return bytes;

    const original = new TextDecoder().decode(theme);
    const patched = applyThemeColors(original, palette);
    // `applyThemeColors` returns its input by reference when the
    // scheme is unrecognised — nothing to do, so skip the repack.
    if (patched === original) return bytes;

    // Directory entries come back from `unzipSync` as zero-length
    // buffers and would be rewritten as zero-length FILES, quietly
    // losing the directory bit. OPC readers key off
    // [Content_Types].xml rather than these, but dropping them keeps
    // the promise that only one part changes.
    const files = Object.fromEntries(
      Object.entries(entries).filter(([name]) => !name.endsWith('/')),
    );
    // Rebuild immutably: a fresh entry map, never a mutation of
    // `entries`, so the parsed original stays intact for the catch.
    return zipSync({ ...files, [THEME_PART]: new TextEncoder().encode(patched) });
  } catch {
    // Unreadable or unrepackable — ship the library's own bytes.
    return bytes;
  }
}
