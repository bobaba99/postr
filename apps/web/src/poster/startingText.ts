/**
 * Starting text: what an empty block shows, and what Issues lists while a
 * poster still holds its starting text (record 29,
 * docs/fixes/29-mvp-simplify.md; docs/launch/mvp-editor/bounded-designs.md
 * §3.1 rule 6 and §3.12).
 *
 * A new poster and a new block start empty and show a grey prompt that is
 * never printed or exported (index.css draws `data-placeholder` on an empty,
 * unfocused editable; the print window builds its own stylesheet). Before
 * record 29 the template's guidance sentences, "Your Poster Title", Insert's
 * two strings and a sample table of made-up results were stored as text, and
 * older posters still hold them; Issues compares with those strings, so it
 * covers older posters without rewriting them.
 *
 * Rule table (Issues), first match per block:
 *   heading or text, no text          → info    "Empty block: type in it or delete it."
 *   heading or text, the old starting
 *     text (a template prompt, or
 *     Insert's "Enter your text here."
 *     or "Section Title")             → info    "This block still has the template's text."
 *   table, every cell the old sample  → warning "This table still has the sample numbers."
 * The title keeps its own row (empty or "Your Poster Title"), in
 * PosterEditor.tsx. Out of scope: spelling; text that merely resembles a
 * prompt; a sample table partly edited (it is the user's from then on).
 */
import type { Block } from '@postr/shared';
import { htmlToPlainText } from './sanitizeHtml';
import { LAYOUT_TEMPLATES } from './templates';

/** The prompts a block shows by type when it has none of its own (blocks.tsx). */
export const DEFAULT_PROMPTS = {
  title: 'Poster title',
  heading: 'Section Heading',
  text: 'Type here… (type / for symbols)',
} as const;

/** What Insert stored before record 29 (PosterEditor.tsx at 21e6671). */
export const OLD_INSERT_TEXTS = ['Enter your text here.', 'Section Title'] as const;

/** The sample table every 3-column poster started with before record 29 (templates.ts at 21e6671). */
export const OLD_SAMPLE_CELLS = [
  'Measure', 'M (SD)', '𝑝', 'DV 1', '4.2 (0.8)', '< .01', 'DV 2', '3.1 (1.1)', '.03', 'DV 3', '2.8 (0.6)', '.12',
] as const;

/** Every template text block's prompt, which until record 29 was its stored text. */
function templatePrompts(): string[] {
  const out = new Set<string>();
  for (const t of Object.values(LAYOUT_TEMPLATES)) {
    for (const b of t.build(48, 36)) if (b.type === 'text' && b.prompt) out.add(b.prompt);
  }
  return [...out];
}

const STARTING_TEXTS = new Set([...templatePrompts(), ...OLD_INSERT_TEXTS].map((s) => s.trim().toLowerCase()));

/** A block's words, without markup; '' for a block the user emptied (a lone <br> included). */
export const plainText = (html: string | undefined | null): string => htmlToPlainText(html ?? '').trim();

/**
 * Empty for the prompt: no words, and no list or picture a user started. A
 * browser can leave a lone `<br>` (or `<div><br></div>`) in a block the user
 * emptied, which defeats CSS `:empty`, so the editor sets `data-empty` from
 * this instead (MEASURED: Chromium leaves "<br>" after ⌘A, Backspace in the
 * title and a text block, simplify-check T1 on 21e6671).
 */
export const isBlankHtml = (html: string | undefined | null): boolean =>
  plainText(html) === '' && !/<(li|img|table)\b/i.test(html ?? '');

/** The text a block held when it was made, before record 29 (compared without markup or case). */
export const isStartingText = (html: string | undefined | null): boolean => STARTING_TEXTS.has(plainText(html).toLowerCase());

/** A table whose every cell is still the old sample (the user has not touched it). */
export const isSampleTable = (b: Block): boolean => {
  const cells = b.tableData?.cells;
  return !!cells && cells.length === OLD_SAMPLE_CELLS.length && cells.every((c, i) => plainText(c) === OLD_SAMPLE_CELLS[i]);
};

export interface StartingTextIssue {
  id: string;
  severity: 'warning' | 'info';
  category: string;
  message: string;
  blockId: string;
}

/** The rule table above, for every block of the poster, in its order. */
export function startingTextIssues(blocks: readonly Block[]): StartingTextIssue[] {
  const out: StartingTextIssue[] = [];
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'text') {
      if (isBlankHtml(b.content)) {
        out.push({ id: `empty-block-${b.id}`, severity: 'info', category: 'Empty block', message: 'Empty block: type in it or delete it.', blockId: b.id });
      } else if (isStartingText(b.content)) {
        out.push({ id: `template-text-${b.id}`, severity: 'info', category: 'Template text', message: "This block still has the template's text.", blockId: b.id });
      }
    } else if (b.type === 'table' && isSampleTable(b)) {
      out.push({ id: `sample-table-${b.id}`, severity: 'warning', category: 'Sample numbers', message: 'This table still has the sample numbers.', blockId: b.id });
    }
  }
  return out;
}

/** A table's prompt, for its first body cell: shown only while every body cell is empty. */
export function tablePromptFor(b: Block): string | undefined {
  const t = b.tableData;
  if (!b.prompt || !t || t.rows < 2) return undefined;
  return t.cells.slice(t.cols).every((c) => isBlankHtml(c)) ? b.prompt : undefined;
}
