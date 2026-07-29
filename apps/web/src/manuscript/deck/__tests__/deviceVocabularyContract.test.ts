/**
 * Contract test: the device vocabulary is DUPLICATED by hand between
 * `apps/web/src/manuscript/deck/styledTypes.ts` (canonical, per its own
 * header comment) and `apps/api/src/narrative/styleDeck.ts`'s
 * `SUPPORTED_DEVICES` (the API's copy — see that file's header comment
 * for why it can't just import the web module).
 *
 * The API package cannot be imported from the web package's test
 * runner (separate workspace, separate build), so this test locks the
 * web vocabulary against a HARD-CODED copy of the api list instead.
 * If either side's vocabulary changes without updating the other, this
 * test is the tripwire: update BOTH styledTypes.ts and
 * apps/api/src/narrative/styleDeck.ts's SUPPORTED_DEVICES together,
 * then update the copy below to match.
 */
import { describe, it, expect } from 'vitest';
import { SUPPORTED_DEVICES } from '../styledTypes';

/** Hard-coded mirror of `SUPPORTED_DEVICES` in
 *  apps/api/src/narrative/styleDeck.ts. Keep in sync by hand. */
const API_SUPPORTED_DEVICES = [
  'plain',
  'quote-block',
  'progress-bar',
  'stat-emphasis',
  'callout',
] as const;

describe('device vocabulary contract (web <-> api)', () => {
  it('web SUPPORTED_DEVICES matches the api copy exactly, in order', () => {
    expect(SUPPORTED_DEVICES).toEqual(API_SUPPORTED_DEVICES);
  });
});
