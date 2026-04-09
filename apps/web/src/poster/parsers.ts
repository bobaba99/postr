/**
 * BibTeX and RIS parsers for reference imports.
 *
 * Both produce the same Reference shape (matching @postr/shared) so
 * the RefsTab can switch between import sources without branching.
 *
 * The parsers are deliberately permissive — academic citation files
 * are messy in the wild — so we extract what we can and skip the rest.
 */
import { nanoid } from 'nanoid';
import type { Reference } from '@postr/shared';

// =========================================================================
// BibTeX
// =========================================================================

/**
 * Splits the input on `@type{` boundaries, then for each entry pulls
 * out a small set of named fields with a forgiving regex. Entries
 * without a title are dropped.
 */
export function parseBibtex(text: string): Reference[] {
  if (!text.trim()) return [];

  const refs: Reference[] = [];
  // Split BEFORE each `@word{` so each chunk contains one entry.
  const chunks = text.split(/(?=@\w+\{)/);

  for (const entry of chunks) {
    if (!entry.trim()) continue;

    const getField = (name: string): string => {
      const re = new RegExp(`${name}\\s*=\\s*[{"]([^}"]*)[}"]`, 'i');
      const m = entry.match(re);
      return m?.[1]?.trim() ?? '';
    };

    const title = getField('title');
    if (!title) continue;

    const authorRaw = getField('author');
    const authors = authorRaw
      ? authorRaw.split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean)
      : [];

    refs.push({
      id: nanoid(8),
      authors,
      year: getField('year'),
      title,
      journal: getField('journal') || getField('booktitle'),
      doi: getField('doi'),
    });
  }

  return refs;
}

// =========================================================================
// RIS
// =========================================================================

interface RisAccumulator {
  authors: string[];
  year: string;
  title: string;
  journal: string;
  doi: string;
}

function emptyRisAccumulator(): RisAccumulator {
  return { authors: [], year: '', title: '', journal: '', doi: '' };
}

/**
 * Parses RIS line-by-line. Each line is `TAG  - VALUE` (two spaces).
 * `TY` opens an entry, `ER` closes it. Multiple `AU`/`A1` lines
 * append to the author list.
 */
export function parseRis(text: string): Reference[] {
  if (!text.trim()) return [];

  const refs: Reference[] = [];
  let current: RisAccumulator | null = null;

  for (const line of text.split(/\r?\n/)) {
    // Allow zero whitespace after the dash so bare `ER  -` end markers match.
    const m = line.match(/^([A-Z][A-Z0-9])\s+-\s*(.*)$/);
    if (!m) continue;

    const [, tag, rawValue] = m;
    const value = (rawValue ?? '').trim();

    if (tag === 'TY') {
      current = emptyRisAccumulator();
      continue;
    }
    if (!current) continue;

    if (tag === 'AU' || tag === 'A1') current.authors.push(value);
    else if (tag === 'PY' || tag === 'Y1') current.year = value.split('/')[0]!.trim();
    else if (tag === 'TI' || tag === 'T1') current.title = value;
    else if (tag === 'JO' || tag === 'JF' || tag === 'T2') {
      if (!current.journal) current.journal = value;
    } else if (tag === 'DO') {
      current.doi = value;
    } else if (tag === 'ER') {
      if (current.title) {
        refs.push({ id: nanoid(8), ...current });
      }
      current = null;
    }
  }

  // Tolerate files that omit the trailing ER line.
  if (current?.title) {
    refs.push({ id: nanoid(8), ...current });
  }

  return refs;
}
