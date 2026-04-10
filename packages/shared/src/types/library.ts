/**
 * Reusable library entries — institutions, authors, references.
 * Imported into a PosterDoc as self-contained snapshots; editing
 * a library row does NOT retroactively mutate existing posters.
 */

export interface InstitutionLib {
  id: string;
  userId: string;
  name: string;
  dept: string | null;
  location: string | null;
  createdAt: string;
}

export interface AuthorLib {
  id: string;
  userId: string;
  name: string;
  /** FK ids into institutions_lib */
  affiliationLibIds: string[];
  isCorresponding: boolean;
  equalContrib: boolean;
  createdAt: string;
}

export interface ReferenceLib {
  id: string;
  userId: string;
  authors: string[];
  year: string | null;
  title: string | null;
  journal: string | null;
  doi: string | null;
  createdAt: string;
}
