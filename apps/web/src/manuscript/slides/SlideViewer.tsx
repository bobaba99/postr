/**
 * SlideViewer — the read-only deck preview (Phase 1).
 *
 * Three stacked surfaces:
 *   1. a thumbnail rail (one card per slide; click selects it),
 *   2. the active slide rendered large — assertion headline, an
 *      evidence / chart placeholder, and an N/30 word-count indicator
 *      whose ok/warn state comes straight from `slide.wordCapCut`,
 *   3. a speaker-notes strip listing the active slide's notes, each
 *      tagged with its provenance so the source is always visible.
 *
 * Read-only ON PURPOSE. No markup, comments, or annotations — those are
 * the standalone viewer in Plan 3 (spec §5). This component never mutates
 * the deck; selection is entirely the parent's business via `onSelect`.
 */
import { countWords } from '../buildDocumentModel';
import { SLIDE_WORD_CAP } from '../deck/slideBudget';
import type { Slide, SlideDeck, SlideRole } from '../deck/types';

interface SlideViewerProps {
  deck: SlideDeck;
  activeIndex: number;
  onSelect: (index: number) => void;
}

/** Short human label for each role — shown on thumbnails and the stage. */
const ROLE_LABEL: Record<SlideRole, string> = {
  title: 'Title',
  hook: 'Hook',
  question: 'Question',
  methods: 'Methods',
  result: 'Result',
  takeaway: 'Takeaway',
  references: 'References',
};

/** Title and reference slides are exempt from the speaking-time word gate
 *  (spec §1) — showing them an N/30 counter would be a lie. */
function isWordCapped(role: SlideRole): boolean {
  return role !== 'title' && role !== 'references';
}

export function SlideViewer({ deck, activeIndex, onSelect }: SlideViewerProps) {
  const active = deck.slides[activeIndex];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ThumbnailRail
        slides={deck.slides}
        activeIndex={activeIndex}
        onSelect={onSelect}
      />
      {active ? (
        <SlideStage slide={active} index={activeIndex} />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#2a2a3a] text-sm text-[#6b7280]">
          Your slides will appear here once the deck is built.
        </div>
      )}
      {active && <SpeakerNotesStrip slide={active} />}
    </div>
  );
}

function ThumbnailRail({
  slides,
  activeIndex,
  onSelect,
}: {
  slides: Slide[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Slides"
      className="flex shrink-0 gap-2 overflow-x-auto pb-1"
    >
      {slides.map((slide, i) => {
        const selected = i === activeIndex;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`Slide ${i + 1}: ${ROLE_LABEL[slide.role]}`}
            onClick={() => onSelect(i)}
            className={`flex aspect-video w-28 shrink-0 flex-col justify-between rounded-md border p-2 text-left transition-colors ${
              selected
                ? 'border-[#7c6aed] bg-[#16161f]'
                : 'border-[#2a2a3a] bg-[#0f0f16] hover:border-[#3a3a4e]'
            }`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
              {i + 1} · {ROLE_LABEL[slide.role]}
            </span>
            <span className="line-clamp-3 text-[10px] leading-tight text-[#c8cad0]">
              {slide.assertion || '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SlideStage({ slide, index }: { slide: Slide; index: number }) {
  const capped = isWordCapped(slide.role);
  const words = countWords(slide.assertion);
  const isTitle = slide.role === 'title';

  return (
    <div
      className="postr-rise-in flex min-h-0 flex-1 flex-col rounded-lg border border-[#2a2a3a] bg-white p-6 text-[#111118]"
      aria-label={`Slide ${index + 1} preview`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
          {ROLE_LABEL[slide.role]}
        </span>
        {capped && <WordCount words={words} cut={slide.wordCapCut} />}
      </div>

      {/* The column scrolls internally (min-h-0 + overflow) so a long
          assertion wraps and scrolls rather than being clipped by the
          fixed-height stage. Real decks are ≤30-word gated, but the
          preview must never hide content. */}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
          isTitle ? 'justify-center' : 'justify-start'
        }`}
      >
        <h2
          className={`shrink-0 font-bold leading-tight text-[#111118] ${
            isTitle ? 'text-3xl' : 'text-xl'
          }`}
        >
          {slide.assertion}
        </h2>

        {slide.evidence && (
          <p className="mt-4 shrink-0 whitespace-pre-line text-sm leading-relaxed text-[#333]">
            {slide.evidence}
          </p>
        )}

        {/* Evidence / chart placeholder — Phase 1 is black-and-white text;
            the figure slot is drawn as an empty framed region so the deck's
            eventual chart has a visible home. Given a minimum height so it
            reads as a real slot, and grows to fill any spare room. */}
        {!isTitle && slide.role !== 'references' && (
          <div className="mt-4 flex min-h-24 flex-1 items-center justify-center rounded-md border border-dashed border-[#d4d4d8] text-xs text-[#9ca3af]">
            Evidence / figure
          </div>
        )}
      </div>
    </div>
  );
}

function WordCount({ words, cut }: { words: number; cut: boolean }) {
  const warn = cut || words > SLIDE_WORD_CAP;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        warn ? 'bg-[#eab30822] text-[#b45309]' : 'bg-[#16a34a22] text-[#15803d]'
      }`}
    >
      {words}/{SLIDE_WORD_CAP} words{cut && ' — trimmed to fit'}
    </span>
  );
}

function SpeakerNotesStrip({ slide }: { slide: Slide }) {
  return (
    <div className="shrink-0 rounded-lg border border-[#2a2a3a] bg-[#0f0f16] p-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
        Speaker notes
      </div>
      {slide.speakerNotes.length === 0 ? (
        <p className="text-xs text-[#6b7280]">No notes for this slide.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {slide.speakerNotes.map((note, i) => (
            <li key={i} className="text-xs leading-relaxed text-[#c8cad0]">
              {note.text}
              {note.provenance && (
                <span className="ml-1.5 rounded bg-[#2b2456] px-1.5 py-0.5 text-[10px] text-[#c8b6ff]">
                  {note.provenance}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
