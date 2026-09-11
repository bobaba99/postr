import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(() => new Promise<never>(() => {})),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

// The plan is swapped per-test via this mutable holder (P0-2: the term
// CTA must not offer a second subscription to an active term holder).
const planState = {
  value: { loading: false, hasActiveTerm: false, isGuest: true },
};
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => planState.value,
}));

import { PRICING_TIERS, PricingSection, type PricingTier } from '../PricingSection';

function wordCount(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}

function renderPricing() {
  return render(
    <MemoryRouter>
      <PricingSection />
    </MemoryRouter>,
  );
}

describe('pricing content hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planState.value = { loading: false, hasActiveTerm: false, isGuest: true };
  });

  it('limits every plan to four supporting messages', () => {
    for (const tier of PRICING_TIERS) {
      expect([tier.forWho, tier.condition, ...tier.features]).toHaveLength(4);
      expect(tier.features).toHaveLength(2);
    }
  });

  it('limits each supporting message to 15 words', () => {
    for (const tier of PRICING_TIERS) {
      for (const message of [tier.forWho, tier.condition, ...tier.features]) {
        expect(wordCount(message), `${tier.name}: ${message}`).toBeLessThanOrEqual(15);
      }
    }
  });

  it('uses progressive disclosure for mobile feature detail', () => {
    const { container } = renderPricing();

    expect(screen.getAllByText("What’s included")).toHaveLength(3);
    expect(container.querySelectorAll('details.sm\\:hidden')).toHaveLength(3);
    expect(container.querySelectorAll('ul.hidden.sm\\:flex')).toHaveLength(3);
  });

  it('uses two tablet columns and three desktop columns', () => {
    const { container } = renderPricing();
    const grid = container.querySelector('[data-pricing-grid]');

    expect(grid?.className).toContain('md:grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
    expect(grid?.className).not.toContain('md:grid-cols-3');
  });

  it('does not repeat plan-selection guidance below the cards', () => {
    renderPricing();

    expect(screen.queryByText(/which should i pick/i)).toBeNull();
  });
});

describe('duplicate-term guard (P0-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the term CTA to a visitor without an active term', () => {
    planState.value = { loading: false, hasActiveTerm: false, isGuest: true };
    renderPricing();

    expect(screen.getByRole('link', { name: 'Get the term' })).toHaveAttribute(
      'href',
      '/auth?plan=term',
    );
    expect(screen.queryByText(/You already have an active term/i)).toBeNull();
  });

  it('replaces the term CTA with a notice for an active term holder', () => {
    planState.value = { loading: false, hasActiveTerm: true, isGuest: false };
    renderPricing();

    expect(screen.queryByRole('link', { name: 'Get the term' })).toBeNull();
    expect(screen.getByText(/You already have an active term/i)).toBeInTheDocument();
    // The pack stays purchasable — credits stack on top of a term.
    expect(screen.getByRole('link', { name: 'Get the pack' })).toHaveAttribute(
      'href',
      '/auth?plan=pack',
    );
  });

  it('does not flash the notice while the plan is still loading', () => {
    planState.value = { loading: true, hasActiveTerm: false, isGuest: true };
    renderPricing();

    expect(screen.getByRole('link', { name: 'Get the term' })).toBeInTheDocument();
    expect(screen.queryByText(/You already have an active term/i)).toBeNull();
  });
});

// Owner rule (2026-09-11): the refund rule must be in front of every buyer
// BEFORE purchase. Each paid card carries its plan-specific line next to
// the CTA, and the section's fine print links to the Terms.
describe('refund rule before purchase (2026-09-11)', () => {
  const tiers: readonly PricingTier[] = PRICING_TIERS;
  const term = tiers.find((tier) => tier.id === 'term');
  const pack = tiers.find((tier) => tier.id === 'pack');
  const free = tiers.find((tier) => tier.id === 'free');

  beforeEach(() => {
    vi.clearAllMocks();
    planState.value = { loading: false, hasActiveTerm: false, isGuest: true };
  });

  it('gives both paid tiers a plan-specific refund line, and the free tier none', () => {
    expect(term?.refund).toMatch(/14 days/);
    expect(pack?.refund).toMatch(/first export/i);
    expect(free?.refund).toBeUndefined();
  });

  it('keeps each refund line plain: two sentences at most, 15 words, no AI mention', () => {
    for (const tier of tiers) {
      if (!tier.refund) continue;
      expect(wordCount(tier.refund), `${tier.name}: ${tier.refund}`).toBeLessThanOrEqual(15);
      expect(tier.refund.split(/[.!?](?:\s|$)/).filter(Boolean).length).toBeLessThanOrEqual(2);
      expect(tier.refund).not.toMatch(/\bAI\b/i);
    }
  });

  it('renders each refund line in the same card as its CTA, right after it', () => {
    renderPricing();
    const pairs = [
      ['Get the term', term?.refund],
      ['Get the pack', pack?.refund],
    ] as const;
    for (const [cta, line] of pairs) {
      const ctaEl = screen.getByRole('link', { name: cta });
      const lineEl = screen.getByText(line!);
      expect(ctaEl.parentElement).toBe(lineEl.parentElement);
      expect(
        ctaEl.compareDocumentPosition(lineEl) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('keeps the term refund line for an active term holder (it still governs their charge)', () => {
    planState.value = { loading: false, hasActiveTerm: true, isGuest: false };
    renderPricing();
    expect(screen.getByText(term!.refund!)).toBeInTheDocument();
  });

  it('links the fine print under the grid to the refund terms', () => {
    renderPricing();
    const link = screen.getByRole('link', { name: /refund terms/i });
    expect(link).toHaveAttribute('href', '/terms#refunds');
    const finePrint = link.closest('p')?.textContent ?? '';
    expect(finePrint).toMatch(/14 days/);
    expect(finePrint).toMatch(/first export/i);
    expect(finePrint).not.toMatch(/\bAI\b/i);
  });
});
