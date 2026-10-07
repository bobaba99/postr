/**
 * Every dictionary of the public pages, by file name, for the parity and
 * typography checks (__tests__/dictionaries.test.ts, which also checks that
 * each dictionary file in this folder is listed here). The refund lines
 * live with the refund rule (data/refundCopy.ts) and are listed too.
 */
import type { Bilingual } from './lang';
import { ABOUT_COPY } from './about';
import { AUTH_COPY } from './auth';
import { BILLING_COPY } from './billing';
import { CHROME_COPY } from './chrome';
import { FIGURE_READABILITY_COPY } from './figureReadability';
import { LANDING_COPY } from './landing';
import { NOT_FOUND_COPY } from './notFound';
import { PRICING_COPY } from './pricing';
import { READABILITY_COPY } from './readability';
import { WHY_POSTERS_COPY } from './whyPosters';
import { REFUND_LINES } from '@/data/refundCopy';

export const DICTIONARIES: Readonly<Record<string, Bilingual<unknown>>> = {
  about: ABOUT_COPY,
  auth: AUTH_COPY,
  billing: BILLING_COPY,
  chrome: CHROME_COPY,
  figureReadability: FIGURE_READABILITY_COPY,
  landing: LANDING_COPY,
  notFound: NOT_FOUND_COPY,
  pricing: PRICING_COPY,
  readability: READABILITY_COPY,
  whyPosters: WHY_POSTERS_COPY,
  refundLines: REFUND_LINES,
};
