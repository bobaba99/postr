/**
 * On-canvas references list — the credit's visibility rule.
 *
 * This is also the print/PDF path: printing serializes the live canvas
 * DOM, so whatever RefsBlock renders here is what lands on the sheet.
 *
 * The rule (owner decision, 2026-07-27): the Postr credit is the last
 * entry of the references list ONLY when the poster has references of
 * its own. Alone under a "References" heading it reads as self-serving
 * rather than as the software citation it is meant to be.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Reference } from '@postr/shared';
import { DEFAULT_PALETTE, DEFAULT_STYLES } from '../constants';
import { ACKNOWLEDGEMENT_TEXT } from '@/export/attribution';
import { RefsBlock } from '../blocks';

const userRefs: Reference[] = [
  { id: 'r1', authors: ['Smith, John'], year: '2026', title: 'A paper', journal: 'Journal of Samples' },
  { id: 'r2', authors: ['Doe, Jane'], year: '2025', title: 'Another paper', journal: 'Sample Reports' },
];

function renderRefs(references: Reference[]) {
  return render(
    <RefsBlock
      references={references}
      palette={DEFAULT_PALETTE}
      fontFamily="Inter"
      styles={DEFAULT_STYLES}
      citationStyle="APA 7"
    />,
  );
}

describe('RefsBlock acknowledgement', () => {
  it('renders the credit as the LAST entry when the poster has references', () => {
    const { container } = renderRefs(userRefs);
    expect(container.textContent).toContain(ACKNOWLEDGEMENT_TEXT);
    expect(screen.getByText('References')).toBeTruthy();
    // Last, not buried mid-list.
    const text = container.textContent ?? '';
    expect(text.indexOf('Smith')).toBeLessThan(text.indexOf(ACKNOWLEDGEMENT_TEXT));
    expect(text.indexOf('Doe')).toBeLessThan(text.indexOf(ACKNOWLEDGEMENT_TEXT));
  });

  it('renders NO credit and NO references section when the poster has none', () => {
    const { container } = renderRefs([]);
    expect(container.textContent).not.toContain(ACKNOWLEDGEMENT_TEXT);
    // No section is created just to hold the credit — the placeholder
    // prompt is shown instead of a "References" heading.
    expect(screen.queryByText('References')).toBeNull();
  });
});
