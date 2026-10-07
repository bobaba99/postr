/**
 * The not-found page's copy (pages/NotFound.tsx), English and French. A
 * not-found address ending in /fr is answered in French (i18n/lang.ts).
 */
import type { Bilingual } from './lang';

const en = {
  notFound: 'Page not found.',
  toPosters: 'Go to your posters',
};

export type NotFoundCopy = typeof en;

const fr: NotFoundCopy = {
  notFound: 'Page introuvable.',
  toPosters: 'Aller à vos affiches',
};

export const NOT_FOUND_COPY: Bilingual<NotFoundCopy> = { en, fr };
