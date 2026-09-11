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

import { PRICING_TIERS, PricingSection } from '../PricingSection';

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
