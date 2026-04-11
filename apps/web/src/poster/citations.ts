/**
 * Citation formatters and reference sort modes.
 *
 * Four citation styles supported: APA 7, Vancouver, IEEE, Harvard.
 * Each formatter takes a Reference + its index and returns a string
 * containing simple `_italic_` markers (rendered by RefsBlock).
 *
 * Sorting is pure: sortReferences returns a new array — never
 * mutates the input.
 */
import type { Reference } from '@postr/shared';

// =========================================================================
// Author formatting (APA-style "Last, F.")
// =========================================================================

function formatOneAuthor(author: string): string {
  const parts = author.split(',');
  if (parts.length <= 1) return author;
  const last = parts[0]!.trim();
  const initials = parts[1]!
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w.charAt(0)}.`)
    .join(' ');
  return `${last}, ${initials}`;
}

export function formatAuthorsApa(authors: string[]): string {
  if (!authors.length) return 'Unknown';
  if (authors.length === 1) return formatOneAuthor(authors[0]!);
  if (authors.length === 2) return `${formatOneAuthor(authors[0]!)} & ${formatOneAuthor(authors[1]!)}`;
  if (authors.length <= 20) {
    const head = authors.slice(0, -1).map(formatOneAuthor).join(', ');
    return `${head}, & ${formatOneAuthor(authors[authors.length - 1]!)}`;
  }
  return `${formatOneAuthor(authors[0]!)} et al.`;
}

// =========================================================================
// Citation styles
// =========================================================================

export type CitationStyleKey = 'APA 7' | 'Vancouver' | 'IEEE' | 'Harvard';

export type CitationFormatter = (ref: Reference, index: number) => string;

/**
 * Pre-formatted paste takes precedence over field-based formatting.
 * If the user pasted their reference as a full string (e.g. directly
 * from the references section of their manuscript), we render it
 * verbatim regardless of the selected style — their formatting is
 * already their authoritative representation of the citation.
 *
 * Vancouver / IEEE still prepend the numeric prefix because those
 * styles rely on the list index, not on the reference's own text.
 */
function raw(r: Reference): string | null {
  const t = r.rawText?.trim();
  return t && t.length > 0 ? t : null;
}

export const CITATION_STYLES: Record<CitationStyleKey, CitationFormatter> = {
  'APA 7': (r) => {
    const rt = raw(r);
    if (rt) return rt;
    const a = formatAuthorsApa(r.authors);
    const year = r.year || 'n.d.';
    const journal = r.journal ? ` _${r.journal}_.` : '';
    return `${a} (${year}). ${r.title ?? ''}.${journal}`;
  },
  Vancouver: (r, i) => {
    const rt = raw(r);
    if (rt) return `${i + 1}. ${rt}`;
    const slice = r.authors.slice(0, 3).map((x) => x.split(',')[0]?.trim() ?? '');
    const a = slice.join(', ') + (r.authors.length > 3 ? ', et al' : '');
    return `${i + 1}. ${a}. ${r.title ?? ''}. ${r.journal ?? ''}. ${r.year ?? ''}.`;
  },
  IEEE: (r, i) => {
    const rt = raw(r);
    if (rt) return `[${i + 1}] ${rt}`;
    const slice = r.authors.slice(0, 3).map((x) => {
      const parts = x.split(',');
      if (parts.length <= 1) return x;
      const initial = parts[1]!.trim().charAt(0);
      return `${initial}. ${parts[0]!.trim()}`;
    });
    const a = slice.join(', ') + (r.authors.length > 3 ? ', et al.' : '');
    const journal = r.journal ? `_${r.journal}_` : '';
    return `[${i + 1}] ${a}, "${r.title ?? ''}," ${journal}, ${r.year ?? ''}.`;
  },
  Harvard: (r) => {
    const rt = raw(r);
    if (rt) return rt;
    const a = formatAuthorsApa(r.authors);
    const year = r.year || 'n.d.';
    const journal = r.journal ? ` _${r.journal}_.` : '';
    return `${a} (${year}) '${r.title ?? ''}',${journal}`;
  },
};

export const DEFAULT_CITATION_STYLE: CitationStyleKey = 'APA 7';

// =========================================================================
// Reference sort modes
// =========================================================================

export type SortMode = 'none' | 'alpha' | 'year' | 'year-asc';

export const SORT_MODE_LABELS: Record<SortMode, string> = {
  none: 'Manual order',
  alpha: 'Alphabetical (first author)',
  year: 'Year (newest first)',
  'year-asc': 'Year (oldest first)',
};

export function sortReferences(refs: Reference[], mode: SortMode): Reference[] {
  if (mode === 'none') return refs;
  const sorted = [...refs];
  if (mode === 'alpha') {
    sorted.sort((a, b) => {
      const aKey = (a.authors[0] ?? '').toLowerCase();
      const bKey = (b.authors[0] ?? '').toLowerCase();
      return aKey.localeCompare(bKey);
    });
  } else if (mode === 'year') {
    sorted.sort((a, b) => (parseInt(b.year ?? '', 10) || 0) - (parseInt(a.year ?? '', 10) || 0));
  } else if (mode === 'year-asc') {
    sorted.sort((a, b) => (parseInt(a.year ?? '', 10) || 0) - (parseInt(b.year ?? '', 10) || 0));
  }
  return sorted;
}
