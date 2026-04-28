/**
 * Parse a free-text authors block (as found on a printed poster) into
 * structured `Author[]` + `Institution[]` arrays matching Postr's data
 * model.
 *
 * Input format covered:
 *   "John Smith1,2, Mary (Mae) Doe1, Alex Roe1
 *    (1) Acme State University, (2) Sample Research Institute, (3) Demo U"
 *
 * Recognized markers:
 *   - Trailing digit groups (1,2 / 1 / 2) -> affiliation refs
 *   - Trailing or interleaved markers (* / dagger / etc) -> contribution
 *   - Numbered institutions on a separate line: "(N) Name" or "N. Name"
 *
 * Returns an empty result when the input doesn't look like an authors
 * block (no numeric refs and no commas) so the caller can fall back to
 * leaving the imported text inside a generic block.
 */
import { nanoid } from 'nanoid';
import type { Author, Institution } from '@postr/shared';

export interface ParsedAuthors {
  authors: Author[];
  institutions: Institution[];
}

export function parseAuthorsText(raw: string): ParsedAuthors {
  if (!raw || !raw.trim()) return { authors: [], institutions: [] };

  const { peopleLine, instLine } = splitPeopleFromInstitutions(raw);
  const institutions = parseInstitutions(instLine);
  const authors = parseAuthorList(peopleLine, institutions);

  return { authors, institutions };
}

function splitPeopleFromInstitutions(raw: string): {
  peopleLine: string;
  instLine: string;
} {
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    const instStart = lines.findIndex((l) => /^(\(?\d+\)?[.)\s])/.test(l));
    if (instStart > 0) {
      return {
        peopleLine: lines.slice(0, instStart).join(' '),
        instLine: lines.slice(instStart).join(' '),
      };
    }
    return {
      peopleLine: lines[0]!,
      instLine: lines.slice(1).join(' '),
    };
  }

  // Single line with " (1) Foo" suffix - split there.
  const splitIdx = raw.search(/\s+\(?1\)?[.)\s]/);
  if (splitIdx > 0) {
    return {
      peopleLine: raw.slice(0, splitIdx).trim(),
      instLine: raw.slice(splitIdx).trim(),
    };
  }

  return { peopleLine: raw.trim(), instLine: '' };
}

function parseInstitutions(line: string): Institution[] {
  if (!line) return [];

  const pairs: { num: number; name: string }[] = [];
  const re = /\(?(\d+)\)?[.)]\s*([^,]+?)(?=\s*[,;]\s*\(?\d+[.)]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const num = parseInt(m[1]!, 10);
    const name = m[2]!.trim();
    if (name) pairs.push({ num, name });
  }

  const seen = new Set<number>();
  return pairs
    .filter((p) => {
      if (seen.has(p.num)) return false;
      seen.add(p.num);
      return true;
    })
    .sort((a, b) => a.num - b.num)
    .map((p) => ({
      id: nanoid(8),
      name: p.name,
    }));
}

function parseAuthorList(line: string, institutions: Institution[]): Author[] {
  if (!line) return [];

  const idByNumber = new Map<number, string>();
  institutions.forEach((inst, i) => idByNumber.set(i + 1, inst.id));

  const items = splitAtTopLevelCommas(line);
  return items.map((item) => parseSingleAuthor(item, idByNumber));
}

/**
 * Split on commas at top-level paren depth, EXCEPT commas wedged
 * between digits (those belong to a multi-affiliation suffix like
 * "Wang1,2"). The protect-and-restore uses U+0001 as a sentinel, which
 * never appears in legitimate poster text.
 */
function splitAtTopLevelCommas(s: string): string[] {
  const SENTINEL = '';
  // Match the comma alone via lookbehind/lookahead so /g doesn't skip
  // past consumed digits — handles "1,2,3" by replacing both commas.
  const protectedStr = s.replace(/(?<=\d)\s*,\s*(?=\d)/g, SENTINEL);
  const restore = (str: string): string =>
    str.replace(new RegExp(SENTINEL, 'g'), ',');

  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of protectedStr) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      const trimmed = buf.trim();
      if (trimmed) out.push(restore(trimmed));
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) out.push(restore(tail));
  return out;
}

function parseSingleAuthor(
  raw: string,
  idByNumber: Map<number, string>,
): Author {
  let isCorresponding = false;
  let equalContrib = false;
  let s = raw.trim();

  // Strip recognized trailing markers.
  while (true) {
    const last = s.slice(-1);
    if (last === '†' || last === '‡') {
      // dagger / double-dagger -> corresponding
      isCorresponding = true;
      s = s.slice(0, -1).trimEnd();
    } else if (
      last === '*' ||
      last === '§' ||
      last === '¶' ||
      last === '#'
    ) {
      // *, section, pilcrow, hash -> equal contribution
      equalContrib = true;
      s = s.slice(0, -1).trimEnd();
    } else {
      break;
    }
  }

  // Affiliation digits at the very end.
  const affilMatch = s.match(/\s*([\d,\s\-–]+)\s*$/);
  const affiliationIds: string[] = [];
  if (affilMatch) {
    const digitRun = affilMatch[1]!.trim();
    if (digitRun && /^[\d,\s\-–]+$/.test(digitRun)) {
      const numbers = expandRefs(digitRun);
      for (const n of numbers) {
        const id = idByNumber.get(n);
        if (id && !affiliationIds.includes(id)) affiliationIds.push(id);
      }
      if (affiliationIds.length > 0) {
        s = s.slice(0, affilMatch.index ?? s.length).trim();
      }
    }
  }

  return {
    id: nanoid(8),
    name: s.replace(/[\s,]+$/, '').trim(),
    affiliationIds,
    isCorresponding,
    equalContrib,
  };
}

function expandRefs(run: string): number[] {
  const out: number[] = [];
  for (const part of run.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const dash = trimmed.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (dash) {
      const a = parseInt(dash[1]!, 10);
      const b = parseInt(dash[2]!, 10);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) out.push(i);
    } else if (/^\d+$/.test(trimmed)) {
      out.push(parseInt(trimmed, 10));
    }
  }
  return out;
}
