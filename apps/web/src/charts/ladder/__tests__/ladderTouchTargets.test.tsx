/**
 * Touch-target floors for the chart-chooser ladder.
 *
 * `/chart-chooser` is a standalone, no-auth tool page — a link a
 * LibGuide can hand to a student, who will very often open it on a
 * phone. It has no fixed-canvas constraint, so "works on mobile" is
 * the floor, not the ceiling.
 *
 * A measured audit (apps/web/scripts/mobile-audit.mjs) found every
 * interactive element in the ladder under the 44px WCAG 2.5.5 / Apple
 * HIG target size: chips at 33px, upload buttons at 36px, the download
 * action at 34px, panel checkboxes at 15px, the reopen link at 22px.
 * These tests pin the floor so a future style tweak cannot quietly
 * drop back under it.
 *
 * The assertions read COMPUTED style rather than class strings,
 * because the fixes live in inline styles and a class-name assertion
 * would pass while the pixels regressed. jsdom does not lay out, so
 * `minHeight` is the honest proxy for "at least this tall" — the real
 * rendered geometry is verified in Chromium via the audit script.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ChipRow } from '../ChipRow';
import { StepSection } from '../StepSection';

/** WCAG 2.5.5 / Apple HIG minimum target size, in CSS px. */
const TARGET_FLOOR = 44;

const heightOf = (el: HTMLElement) =>
  parseFloat(getComputedStyle(el).minHeight || '0');

describe('ladder chips', () => {
  it('meet the 44px target floor', () => {
    // Chips ARE the questionnaire: a mis-tap silently advances the
    // ladder down the wrong branch, which is worse than a dead tap.
    render(
      <ChipRow
        label="Outcome type"
        options={[
          { value: 'continuous', label: 'Continuous' },
          { value: 'categorical', label: 'Categorical' },
        ]}
        selected={null}
        onPick={() => {}}
      />,
    );
    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(heightOf(chip)).toBeGreaterThanOrEqual(TARGET_FLOOR);
    }
  });

  it('keep chip labels at or above the 12px legibility floor', () => {
    render(
      <ChipRow
        label="Outcome type"
        options={[{ value: 'continuous', label: 'Continuous' }]}
        selected={null}
        onPick={() => {}}
      />,
    );
    const fontSize = parseFloat(getComputedStyle(screen.getByRole('button')).fontSize);
    expect(fontSize).toBeGreaterThanOrEqual(12);
  });
});

describe('answered step summary', () => {
  it('gives the reopen control a real target, not a 22px sliver', () => {
    // Re-opening an answered step is the only way back up the ladder.
    render(
      <StepSection
        index={1}
        title="Your data"
        state="answered"
        summary="3 rows × 2 columns"
        onReopen={() => {}}
        shouldFocusOnMount={false}
      >
        <div />
      </StepSection>,
    );
    const reopen = screen.getByRole('button', { name: /change/i });
    expect(heightOf(reopen)).toBeGreaterThanOrEqual(TARGET_FLOOR);
  });

  it('keeps the step index legible on a phone', () => {
    const { container } = render(
      <StepSection
        index={2}
        title="Pick your figure"
        state="answered"
        summary="1 outcome × 1 factor"
        onReopen={() => {}}
        shouldFocusOnMount={false}
      >
        <div />
      </StepSection>,
    );
    const index = within(container).getByText('2');
    expect(parseFloat(getComputedStyle(index).fontSize)).toBeGreaterThanOrEqual(12);
  });
});
