/**
 * Record 29 — the hide switches outside the editor (owner decisions D3 and
 * D4 of 2026-10-07; config/features.ts IMPORT_ENABLED, ADJUSTMENTS_ENABLED,
 * EDITOR_EXTRAS_ENABLED; docs/fixes/29-mvp-simplify.md).
 *
 * The dashboard's new-poster button offers "+ New poster" alone (no
 * "Import…", no menu whose items were New poster and Import); the
 * first-visit tour has no Import or guidelines step and names no .postr
 * file, Staples or citation style; the profile page offers no row that only
 * a hidden control fills (style presets, checklist templates). The editor
 * is src/poster/__tests__/mvpHidden.test.tsx.
 *
 * Re-run: npx vitest run src/__tests__/mvpHiddenPages.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const auth = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', is_anonymous: false, email: 'jane@example.com', created_at: '2026-09-01T00:00:00Z' } }, error: null })),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth, rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/data/posters', () => ({
  listPosters: vi.fn(async () => []),
  deletePoster: vi.fn(async () => {}),
  createPoster: vi.fn(async () => ({ id: 'p1' })),
}));
vi.mock('@/data/consent', () => ({
  getConsent: vi.fn(async () => ({ research: false, marketing: false })),
  writeConsent: vi.fn(async () => true),
}));
vi.mock('@/data/feedback', () => ({ listMyFeedback: vi.fn(async () => []) }));
vi.mock('@/data/gallery', () => ({ listMyGallery: vi.fn(async () => []), retractGalleryEntry: vi.fn(), labelForField: (f: string) => f }));
vi.mock('@/data/billing', () => ({ openBillingPortal: vi.fn(), requestRefund: vi.fn() }));
vi.mock('@/data/account', () => ({ deleteAccount: vi.fn() }));
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    loading: false, hasActiveTerm: false, credits: 0, reviewCredits: 0, hasReviewAddon: false, canReview: false,
    canExport: false, isGuest: false, subscriptionStatus: null, refresh: vi.fn(), applyCredits: vi.fn(),
  }),
}));
// A custom checklist template saved from the guidelines panel's scratch pad.
vi.mock('@/poster/GuidelinesPanel', () => ({
  getAllTemplates: () => [{ name: 'Lab checklist', items: ['One'], builtIn: false }],
  saveCustomTemplates: vi.fn(),
}));
vi.mock('@/components/PresetEditModal', () => ({ PresetEditModal: () => null }));
vi.mock('@/components/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('@/seo/useDocumentMeta', () => ({ useDocumentMeta: () => {} }));

import { NewPosterButton } from '@/components/NewPosterButton';
import { OnboardingTour } from '@/components/OnboardingTour';
import Profile from '@/pages/Profile';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the dashboard offers no import (IMPORT_ENABLED, D3)', () => {
  it('"+ New poster" alone: no Import… and no menu', () => {
    render(<MemoryRouter><NewPosterButton /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '+ New poster' })).toBeTruthy();
    expect(document.querySelector('[data-postr-import-cta]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More poster options' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Import/);
  });
});

describe('the first-visit tour names no hidden control', () => {
  it('no Import or guidelines step; no .postr, Staples or citation style', async () => {
    vi.useFakeTimers();
    render(<OnboardingTour />);
    const steps: string[] = [];
    await act(async () => { vi.advanceTimersByTime(900); });
    for (let i = 0; i < 12; i += 1) {
      const next = screen.queryByRole('button', { name: /^(Next →|Done)$/ });
      if (!next) break;
      // The step's tooltip: the nearest box around the button that holds its words.
      let box: HTMLElement | null = next;
      while (box && (box.textContent ?? '').length < 80) box = box.parentElement;
      steps.push(box?.textContent ?? '');
      const done = next.textContent === 'Done';
      await act(async () => { fireEvent.click(next); vi.advanceTimersByTime(50); });
      if (done) break;
    }
    expect(steps.length, 'precondition: the tour ran').toBeGreaterThanOrEqual(4);
    const text = steps.join('\n');
    expect(text).not.toMatch(/\.postr|Import it|Staples|guidelines|board sizes|Vancouver|IEEE|Harvard/i);
    expect(text, 'the export step stays').toMatch(/Save as PDF/);
  });
});

describe('the profile page offers no row only a hidden control fills', () => {
  it('no style presets row (ADJUSTMENTS_ENABLED) and no checklist templates (EDITOR_EXTRAS_ENABLED)', async () => {
    localStorage.setItem('postr.style-presets', JSON.stringify([{ name: 'Smith Lab Green' }]));
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Onboarding tour')).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/style presets?|Checklist templates|Scratch Pad/i);
  });
});
