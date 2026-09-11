import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(() => new Promise<never>(() => {})),
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

vi.mock('@/data/checkoutIntent', () => ({
  resolveCheckoutPlan: (value: string | null) =>
    value === 'term' || value === 'pack' ? value : null,
  parseCheckoutPlan: (value: string | null) =>
    value === 'term' || value === 'pack' ? value : null,
  stashCheckoutIntent: vi.fn(),
  clearCheckoutIntent: vi.fn(),
  startCheckoutForPlan: vi.fn(),
}));

vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    loading: false,
    hasActiveTerm: false,
    isGuest: true,
    refresh: vi.fn(),
    applyCredits: vi.fn(),
  }),
}));

vi.mock('@/data/consent', () => ({
  writeConsent: vi.fn(),
  stashSignupConsent: vi.fn(),
  readStashedSignupConsent: vi.fn(() => ({
    research: false,
    marketing: false,
  })),
  clearStashedSignupConsent: vi.fn(),
}));

import Auth from '../Auth';

function renderPaidSignup() {
  return render(
    <MemoryRouter initialEntries={['/auth?plan=term']}>
      <Auth />
    </MemoryRouter>,
  );
}

function wordCount(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}

describe('paid signup audit regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses one level-one task heading', () => {
    renderPaidSignup();

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Create your account');
  });

  it('provides a direct plan recovery path', () => {
    renderPaidSignup();

    expect(screen.getByRole('link', { name: /change plan/i })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('keeps optional email preferences collapsed and unchecked', () => {
    const { container } = renderPaidSignup();
    const disclosure = screen
      .getByText('Email preferences (optional)')
      .closest('details');

    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute('open');
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it('keeps each preference description within 15 words', () => {
    renderPaidSignup();

    for (const checkbox of screen.getAllByRole('checkbox')) {
      const label = checkbox.closest('label');
      expect(label).not.toBeNull();
      expect(wordCount(label?.textContent ?? '')).toBeLessThanOrEqual(15);
    }
  });

  it('labels the email and password fields', () => {
    renderPaidSignup();

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Create password')).toBeInTheDocument();
  });

  it('uses a compact legal footer instead of the public sitemap', () => {
    renderPaidSignup();

    expect(screen.queryByRole('heading', { name: 'Product' })).toBeNull();
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: /terms/i })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: /cookies/i })).toHaveAttribute(
      'href',
      '/cookies',
    );
  });

  it('does not render the audited failing foreground or CTA pairs', () => {
    const { container } = renderPaidSignup();
    const classNames = Array.from(container.querySelectorAll<HTMLElement>('*'))
      .map((element) => element.getAttribute('class'))
      .filter((value): value is string => value !== null);

    expect(classNames.some((value) => value.includes('text-[#6b7280]'))).toBe(false);
    expect(classNames.some((value) => value.includes('text-[#555]'))).toBe(false);
    expect(
      classNames.some(
        (value) =>
          value.includes('text-white') && value.includes('bg-[#7c6aed]'),
      ),
    ).toBe(false);
  });
});

// Owner rule (2026-09-11): the checkout-resume banner states the refund
// rule for the plan it is about to sell, under the plan label.
function renderPaidSignupFor(plan: 'term' | 'pack') {
  return render(
    <MemoryRouter initialEntries={[`/auth?plan=${plan}`]}>
      <Auth />
    </MemoryRouter>,
  );
}

describe('refund rule on the checkout-resume banner (2026-09-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('states the term refund line under the term label', () => {
    renderPaidSignupFor('term');

    const label = screen.getByText('Term · CA$18.99 / 4 months');
    const line = screen.getByText(/14 days/);
    expect(label.parentElement).toBe(line.parentElement);
    expect(
      label.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(line.textContent).not.toMatch(/\bAI\b/i);
    expect(screen.queryByText(/first export/i)).toBeNull();
  });

  it('states the pack refund line under the pack label', () => {
    renderPaidSignupFor('pack');

    const label = screen.getByText('Export pack · CA$9.99');
    const line = screen.getByText(/first export/i);
    expect(label.parentElement).toBe(line.parentElement);
    expect(line.textContent).toMatch(/no refund after/i);
    expect(screen.queryByText(/14 days/)).toBeNull();
  });
});
