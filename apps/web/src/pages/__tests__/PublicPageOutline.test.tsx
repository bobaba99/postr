import { readFileSync, readdirSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(() => new Promise<never>(() => {})),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

vi.mock('@/motion/timelines/aboutRoadtrip', () => ({
  aboutRoadtrip: vi.fn(() => ({ revert: vi.fn() })),
}));

import About from '../About';

const srcRoot = `${process.cwd()}/src`;
const auditedFiles = [
  'routes.tsx',
  'components/PublicHeader.tsx',
  'components/PublicFooter.tsx',
  'pages/Landing.tsx',
  'pages/About.tsx',
  'pages/PaperToPoster.tsx',
  'pages/PaperToSlides.tsx',
  'pages/ChartChooser.tsx',
  'pages/WhyPosters.tsx',
  'pages/Profile.tsx',
  ...readdirSync(`${srcRoot}/manuscript/slides`)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => `manuscript/slides/${name}`),
];

function sourceOf(relativePath: string): string {
  return readFileSync(`${srcRoot}/${relativePath}`, 'utf8');
}

describe('audited public-page outline and contrast', () => {
  it('introduces milestone h3 elements with a timeline h2', () => {
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    const timelineHeading = screen.getByRole('heading', {
      level: 2,
      name: /postr milestones/i,
    });
    const firstMilestone = screen.getAllByRole('heading', { level: 3 })[0];

    expect(
      timelineHeading.compareDocumentPosition(firstMilestone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not use the audited low-contrast muted text token', () => {
    const offenders = auditedFiles.filter((file) =>
      sourceOf(file).includes('text-[#6b7280]'),
    );

    expect(offenders).toEqual([]);
  });

  it('does not place white text on the bright violet surface', () => {
    const failingPair =
      /bg-\[#7c6aed\][^"'`\n}]*text-white|text-white[^"'`\n}]*bg-\[#7c6aed\]/;
    const offenders = auditedFiles.filter((file) =>
      failingPair.test(sourceOf(file)),
    );

    expect(offenders).toEqual([]);
  });
});
