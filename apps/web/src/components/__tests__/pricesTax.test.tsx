/**
 * Fix 25 — Stripe prices are before tax (owner decision 2026-10-06), so
 * every price a buyer is shown says tax is extra, right beside it.
 * Engineering record: docs/fixes/25-latex-hidden-prices.md.
 *
 * Read as rendered, where a buyer reads them: the /pricing page (whose
 * cards print the amount large and the tax note under it, two strings the
 * copy inventory cannot join), the in-editor paywall, and the profile's
 * free-plan panel. "Beside it" means the tax note starts within 40
 * characters after the price in the surface's text. The /auth?plan=
 * checkout banner is read in src/pages/__tests__/Auth.audit.test.tsx, and
 * the copy inventory (src/__tests__/copyInventory.test.ts) checks every
 * other string with a price.
 *
 * Re-run: npx vitest run src/components/__tests__/pricesTax.test.tsx
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { PlanState } from '@/hooks/usePlan';
import { pricesWithTax } from '@/test/copyScan';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(() => new Promise<never>(() => {})) } },
}));

const FREE_ACCOUNT: PlanState = {
  loading: false,
  hasActiveTerm: false,
  credits: 0,
  reviewCredits: 0,
  hasReviewAddon: false,
  canReview: false,
  canExport: false,
  isGuest: false,
  subscriptionStatus: null,
  refresh: vi.fn(async () => FREE_ACCOUNT),
  applyCredits: vi.fn(),
};
vi.mock('@/hooks/usePlan', () => ({ usePlan: () => FREE_ACCOUNT }));
vi.mock('@/data/billing', () => ({
  createCheckout: vi.fn(),
  consumeExportCredit: vi.fn(),
  markPaidExport: vi.fn(),
  isAlreadySubscribedError: () => false,
  NoExportCreditError: class extends Error {},
  openBillingPortal: vi.fn(),
  requestRefund: vi.fn(),
}));

import { PricingSection } from '../PricingSection';
import { EditableExportButtons } from '@/poster/sidebar/EditableExportButtons';
import { SubscriptionPanel } from '@/profile/SubscriptionPanel';
import { usePosterStore } from '@/stores/posterStore';

/**
 * The surface's text, its text nodes joined by a space: `textContent` runs
 * two elements' words together ("taxesFor"), which no reader sees.
 */
function visibleText(root: Element): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? '');
  return parts.join(' ');
}

function expectTaxBesideEveryPrice(root: Element, atLeast: number) {
  const prices = pricesWithTax(visibleText(root));
  expect(prices.length, 'precondition: the surface shows prices').toBeGreaterThanOrEqual(atLeast);
  expect(prices.filter((p) => !p.taxed)).toEqual([]);
}

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('every price a buyer is shown says tax is extra', () => {
  it('the /pricing cards: both paid tiers', () => {
    const { container } = inRouter(<PricingSection />);
    expectTaxBesideEveryPrice(container, 2);
  });

  it('the in-editor paywall: the term and the pack', () => {
    usePosterStore.setState({
      doc: { widthIn: 36, heightIn: 24, blocks: [], palette: {} },
      posterTitle: 'Test poster',
    } as never);
    const { container } = inRouter(<EditableExportButtons citationStyle="APA 7" />);
    expect(container.textContent, 'precondition: the paywall is shown').toMatch(/Get the term/);
    expectTaxBesideEveryPrice(container, 2);
  });

  it('the profile’s free-plan panel: the pack it names', () => {
    const { container } = inRouter(<SubscriptionPanel plan={FREE_ACCOUNT} />);
    expectTaxBesideEveryPrice(container, 1);
  });
});
