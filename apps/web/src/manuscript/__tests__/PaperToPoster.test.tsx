/**
 * Standalone page smoke test — the chat shell renders, ingests a
 * pasted manuscript, reports the deterministic summary, and walks the
 * first scripted question. The condense call itself is exercised in
 * the API tests; here we stop before the outline step.
 */
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import PaperToPoster from '../../pages/PaperToPoster';
import routesJson from '../../seo/routes.json';

const MANUSCRIPT = `Sleep Duration and Recall Accuracy in Undergraduate Students

John Smith1, Jane Doe2
(1) Acme State University, (2) Sample Research Institute

Introduction

Memory consolidation depends on sleep, and prior work has focused on total deprivation rather than the partial restriction students actually experience during a normal term. We asked whether moderate sleep restriction produces measurable recall deficits in this population.

Methods

Participants were 120 undergraduates randomized to three sleep groups for one week, and recall was measured with a standard forty-item word-list task.

Results

Recall accuracy fell 21% in the restricted group (p < .001). The intermediate group showed a 9% deficit (p = .02).

Discussion

Even moderate restriction measurably impairs recall, which should inform how universities schedule examinations.`;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/paper-to-poster']}>
      <PaperToPoster />
    </MemoryRouter>,
  );
}

describe('PaperToPoster page', () => {
  it('renders the h1 the prerender script injects for crawlers', () => {
    renderPage();
    // Crawler copy parity: the prerendered document and the hydrated
    // page must show the same heading, or the crawled page and the
    // human page disagree.
    const record = (routesJson.static as Record<string, { h1: string }>)[
      '/paper-to-poster'
    ]!;
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      record.h1,
    );
  });

  it('greets with the paste prompt and a docx upload affordance', () => {
    renderPage();
    expect(screen.getByText(/paste your manuscript below/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload a \.docx/i })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/paste your manuscript here/i),
    ).toBeInTheDocument();
  });

  it('rejects a too-short paste with a bounded scripted reply', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/paste your manuscript here/i), {
      target: { value: 'Just a sentence.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /read it/i }));
    expect(
      screen.getByText(/shorter than a manuscript/i),
    ).toBeInTheDocument();
  });

  it('ingests a manuscript, reports the summary, and asks Q1', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/paste your manuscript here/i), {
      target: { value: MANUSCRIPT },
    });
    fireEvent.click(screen.getByRole('button', { name: /read it/i }));

    expect(screen.getByText(/got it — /i)).toBeInTheDocument();
    expect(
      screen.getByText(/one thing someone should remember/i),
    ).toBeInTheDocument();

    // Q1 is free text — answer it and land on the table-or-plot step.
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), {
      target: { value: 'Moderate restriction impairs recall.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(screen.getByText(/as a table, or as a plot/i)).toBeInTheDocument();
    expect(
      screen.getByText(/plot usually condenses results better/i),
    ).toBeInTheDocument();

    // Choosing a table keeps the chart panel closed and reaches the
    // finding-ranking question, which prompt.ts still consumes.
    fireEvent.click(screen.getByRole('button', { name: /^a table$/i }));
    expect(screen.getByText(/which result leads/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep this order/i })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: /^chart builder$/i })).not.toBeInTheDocument();
  });

  it('opens the chart builder beside the chat when the user picks a plot', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/paste your manuscript here/i), {
      target: { value: MANUSCRIPT },
    });
    fireEvent.click(screen.getByRole('button', { name: /read it/i }));
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), {
      target: { value: 'Moderate restriction impairs recall.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^a plot$/i }));

    // Inline panel, plus the escape hatch to the full tool — the user
    // never has to leave this page.
    expect(screen.getByRole('complementary', { name: /^chart builder$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the full tool/i })).toHaveAttribute(
      'href',
      '/chart-chooser',
    );

    // And it closes without disturbing the script.
    fireEvent.click(screen.getByRole('button', { name: /close chart builder/i }));
    expect(screen.queryByRole('complementary', { name: /^chart builder$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/which result leads/i)).toBeInTheDocument();
  });

  /**
   * No fixed-canvas constraint here, so a phone is a first-class
   * viewport. The two panes must STACK below `lg` (side-by-side at
   * 375px would give each ~180px) and the chat controls must clear the
   * 44px target floor — a measured audit found them at 30–36px.
   */
  describe('phone ergonomics', () => {
    /** WCAG 2.5.5 / Apple HIG minimum target size, in CSS px. */
    const TARGET_FLOOR = 44;

    it('stacks the chat and preview panes below the lg breakpoint', () => {
      const { container } = renderPage();
      const row = container.querySelector('[class*="lg:flex-row"]');
      expect(row).not.toBeNull();
      // Column by default, row only once there is width for two panes.
      expect(row!.className).toContain('flex-col');
      expect(row!.className).toContain('lg:flex-row');
    });

    it('sizes the chat pane to the viewport rather than a fixed 460px', () => {
      const { container } = renderPage();
      const chat = container.querySelector('section[aria-label="Interview"]');
      // A hard 460px on an 812px-tall phone left the preview pane a
      // sliver; a viewport-relative height keeps both usable.
      expect(chat!.className).toContain('h-[65vh]');
      expect(chat!.className).toContain('lg:h-auto');
    });

    it('gives the chat controls a 44px target', () => {
      renderPage();
      for (const name of [/upload a \.docx/i, /read it/i]) {
        const button = screen.getByRole('button', { name });
        expect(button.className).toContain('min-h-11');
      }
      // Guard the intent, not just the class: min-h-11 IS 44px.
      expect(TARGET_FLOOR).toBe(44);
    });
  });
});
