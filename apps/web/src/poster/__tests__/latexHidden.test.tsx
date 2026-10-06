/**
 * Fix 25 — the LaTeX export is hidden (owner decision 2026-10-06:
 * "unnecessary for now"; config/features.ts LATEX_EXPORT_ENABLED).
 * Engineering record: docs/fixes/25-latex-hidden-prices.md.
 *
 * Entered the way a researcher gets there: the editor opens a poster, they
 * open the Export tab. Whoever they are (a guest, a free account at the
 * paywall, a pack holder, a term holder), the tab offers no LaTeX button
 * and names LaTeX nowhere: not in the paywall ("Overleaf" included), the
 * credit line, or the size notes for a poster too big for PowerPoint.
 * PowerPoint and the PDF stay. The copy inventory
 * (src/__tests__/copyInventory.test.ts) covers the other pages.
 *
 * Re-run: npx vitest run src/poster/__tests__/latexHidden.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { PlanState } from '@/hooks/usePlan';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: authSpies,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

const plan = vi.hoisted(() => ({ current: null as unknown as PlanState }));
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => plan.current }));

import { NoopResizeObserver, load, makeDoc, nextTask, openTab, renderEditor } from './editorKit';

type Who = 'a guest' | 'a free account' | 'a pack holder' | 'a term holder';

function planFor(who: Who): PlanState {
  const base = {
    loading: false,
    hasActiveTerm: false,
    credits: 0,
    reviewCredits: 0,
    hasReviewAddon: false,
    canReview: false,
    canExport: false,
    isGuest: false,
    subscriptionStatus: null,
    refresh: vi.fn(async () => base),
    applyCredits: vi.fn(),
  };
  if (who === 'a guest') return { ...base, isGuest: true };
  if (who === 'a pack holder') return { ...base, credits: 2, canExport: true };
  if (who === 'a term holder') return { ...base, hasActiveTerm: true, canExport: true, subscriptionStatus: 'active' };
  return base;
}

const LATEX_CLAIM = /latex|overleaf|\.tex\b/i;

/** The Export tab's panel: the sidebar region holding the PowerPoint button. */
function exportPanelText(): string {
  const pptx = document.querySelector('[data-postr-export-pptx]');
  expect(pptx, 'precondition: the Export tab shows the PowerPoint button').not.toBeNull();
  let panel: Element | null = pptx;
  while (panel && !/Save PDF/.test(panel.textContent ?? '')) panel = panel.parentElement;
  expect(panel, 'precondition: the panel also holds Save PDF').not.toBeNull();
  return panel!.textContent ?? '';
}

async function openExportTab(who: Who, widthIn = 48, heightIn = 36) {
  plan.current = planFor(who);
  load(makeDoc(widthIn, heightIn));
  renderEditor();
  await nextTask();
  await act(async () => { openTab(/export/i); });
  await nextTask();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Export tab offers no LaTeX export', () => {
  it.each<Who>(['a guest', 'a free account', 'a pack holder', 'a term holder'])(
    'for %s: no LaTeX button, and no copy names LaTeX or Overleaf',
    async (who) => {
      await openExportTab(who);
      expect(document.querySelector('[data-postr-export-latex]')).toBeNull();
      expect(exportPanelText()).not.toMatch(LATEX_CLAIM);
    },
  );

  it('a free account sees the paywall, and it offers PowerPoint only', async () => {
    await openExportTab('a free account');
    expect(exportPanelText()).toMatch(/Keep editing in PowerPoint/);
    expect(exportPanelText()).toMatch(/Get the term/);
  });

  it.each([
    ['half size (60 × 40 in)', 60, 40, /print at 200%/],
    ['too big even at half size (120 × 60 in)', 120, 60, /too large for PowerPoint/],
  ])('a poster %s: the size note sends no one to LaTeX', async (_label, w, h, note) => {
    await openExportTab('a term holder', w, h);
    expect(exportPanelText(), 'precondition: the size note is shown').toMatch(note);
    expect(exportPanelText()).not.toMatch(LATEX_CLAIM);
  });

  it('a poster too big for PowerPoint is pointed at the PDF, which the tab offers', async () => {
    await openExportTab('a term holder', 120, 60);
    expect(exportPanelText()).toMatch(/Save a PDF instead/);
  });
});
