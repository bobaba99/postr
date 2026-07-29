/**
 * Task 8 tests — the free/paid export drawer (spec §6) and a light
 * SlideViewer read-only-preview check.
 *
 * The drawer copy is a monetization contract, not decoration: it must
 * state plainly that the polished deck is FREE and that money is only
 * for the editable PowerPoint file. These assertions lock that promise
 * (spec §6 — "The polish is FREE… only for the editable file").
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExportDrawer } from '../ExportDrawer';
import { SlideViewer } from '../SlideViewer';
import type { SlideDeck } from '../../deck/types';

const emptyDeck: SlideDeck = { durationMinutes: 10, slides: [] };

const sampleDeck: SlideDeck = {
  durationMinutes: 10,
  slides: [
    {
      role: 'title',
      assertion: 'Spaced practice in the classroom',
      evidence: null,
      sourceQuote: '',
      speakerNotes: [],
      references: [],
      wordCapCut: false,
    },
    {
      role: 'result',
      assertion: 'Spacing raised 6-week recall by 34%.',
      evidence: null,
      sourceQuote: 'a 34% improvement in delayed recall',
      speakerNotes: [
        { text: 'Emphasise the delayed measure, not immediate.', provenance: 'Results' },
      ],
      references: [],
      wordCapCut: false,
    },
    {
      role: 'references',
      assertion: 'References',
      evidence: 'Doe J. 2026. Journal of Learning.',
      sourceQuote: '',
      speakerNotes: [],
      references: [],
      wordCapCut: false,
    },
  ],
};

describe('ExportDrawer', () => {
  it('presents a free PDF and a paid PPTX, and states polish is free', () => {
    render(
      <ExportDrawer
        open
        deck={emptyDeck}
        onToggle={() => {}}
        onExportPdf={() => {}}
        onExportPptx={() => {}}
      />,
    );
    // "free" appears in several honest places (the Free badge, the
    // polish-is-free line, the free-forever promise) — assert presence,
    // not uniqueness.
    expect(screen.getAllByText(/free/i).length).toBeGreaterThan(0);
    // ".pptx" is both the card title and the export button label.
    expect(screen.getAllByText(/\.pptx/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/made by postr\.sh/i)).toBeInTheDocument();
    expect(screen.getByText(/\$18\.99|3 exports/i)).toBeInTheDocument();
  });

  it('states the polished deck is free — you pay only for the editable file', () => {
    render(
      <ExportDrawer
        open
        deck={emptyDeck}
        onToggle={() => {}}
        onExportPdf={() => {}}
        onExportPptx={() => {}}
      />,
    );
    expect(
      screen.getByText(/only.*(pay|for).*editable file|editable file/i),
    ).toBeInTheDocument();
  });

  it('renders the price + account note ABOVE the PPTX button so the two export buttons bottom-align', () => {
    // The PDF card's CTA is a lone button; the PPTX card's CTA is a button
    // plus two lines of pricing/account copy. For both buttons to land on
    // the same baseline (equal-height grid cards, each flex-col), the button
    // must be the LAST element in its action block — i.e. the price copy
    // comes first. This locks that document order (a layout regression that
    // moved the copy back below the button would misalign the buttons again).
    render(
      <ExportDrawer
        open
        deck={emptyDeck}
        onToggle={() => {}}
        onExportPdf={() => {}}
        onExportPptx={() => {}}
      />,
    );
    const pptxButton = screen.getByRole('button', { name: /export powerpoint|\.pptx/i });
    const priceLine = screen.getByText(/\$18\.99 CAD/i);
    // DOCUMENT_POSITION_FOLLOWING (4) set on the button → the price line
    // precedes the button in the DOM. That is the bottom-aligning order.
    expect(priceLine.compareDocumentPosition(pptxButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('fires the export callbacks when the format buttons are clicked', () => {
    const onExportPdf = vi.fn();
    const onExportPptx = vi.fn();
    render(
      <ExportDrawer
        open
        deck={emptyDeck}
        onToggle={() => {}}
        onExportPdf={onExportPdf}
        onExportPptx={onExportPptx}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    fireEvent.click(screen.getByRole('button', { name: /powerpoint|\.pptx/i }));
    expect(onExportPdf).toHaveBeenCalledTimes(1);
    expect(onExportPptx).toHaveBeenCalledTimes(1);
  });
});

describe('SlideViewer', () => {
  it('renders one thumbnail per slide and shows the active slide assertion', () => {
    render(<SlideViewer deck={sampleDeck} activeIndex={1} onSelect={() => {}} />);
    expect(screen.getAllByRole('tab')).toHaveLength(sampleDeck.slides.length);
    // The active slide's assertion is the stage heading (it also appears in
    // its thumbnail — target the heading specifically).
    expect(
      screen.getByRole('heading', { name: /spacing raised 6-week recall by 34%/i }),
    ).toBeInTheDocument();
  });

  it('calls onSelect with the clicked thumbnail index', () => {
    const onSelect = vi.fn();
    render(<SlideViewer deck={sampleDeck} activeIndex={0} onSelect={onSelect} />);
    const thumbs = screen.getAllByRole('tab');
    fireEvent.click(thumbs[thumbs.length - 1]!);
    expect(onSelect).toHaveBeenCalledWith(sampleDeck.slides.length - 1);
  });

  it('shows the active slide speaker note with its provenance tag', () => {
    render(<SlideViewer deck={sampleDeck} activeIndex={1} onSelect={() => {}} />);
    expect(
      screen.getByText(/emphasise the delayed measure/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Results/)).toBeInTheDocument();
  });
});
