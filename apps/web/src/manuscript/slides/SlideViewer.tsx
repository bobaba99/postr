/**
 * SlideViewer — the deck preview (Phase 1 plain + Phase 2 styled).
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
 *
 * ── Phase 2 (Task 10) — the styled deck + VibeField ──────────────────
 * When `styledDeck` is present, the stage renders the THEMED slide
 * (positioned `StyledElement`s, absolute-positioned to mirror the
 * pptx/pdf writers' (x, y) inches — see `deckWriter.ts`'s
 * `addKnownElement` for the element-kind vocabulary this mirrors) instead
 * of the plain black-and-white `Slide`. The thumbnail rail and speaker
 * notes keep reading off the plain `deck` — the styled model carries no
 * speaker notes of its own (design is Arm P/T's job, not narrative's).
 * `designLoading` / `designError` cover the auto-style+theme pass
 * in flight; on error the plain deck stays visible underneath (never a
 * dead end, spec §1) with a generic retry line (house rule: never raw
 * error text).
 */
import { countWords } from '../buildDocumentModel';
import { SLIDE_WORD_CAP } from '../deck/slideBudget';
import type { Slide, SlideDeck, SlideRole } from '../deck/types';
import type { StyledElement, StyledSlide, StyledSlideDeck } from '../deck/styledTypes';
import { VibeField } from './VibeField';

interface SlideViewerProps {
  deck: SlideDeck;
  activeIndex: number;
  onSelect: (index: number) => void;
  /** The auto-styled + themed deck (Task 10). Undefined while it has
   *  never successfully run — the plain deck renders instead. */
  styledDeck?: StyledSlideDeck | null;
  /** Style/theme call in flight — shows a loading line above the stage. */
  designLoading?: boolean;
  /** Style/theme call failed — generic line, plain deck stays visible. */
  designError?: boolean;
  /** VibeField wiring (Task 10 §1: re-vibe re-runs theme only). Omitted
   *  entirely (no VibeField rendered) until there is a styled deck to
   *  re-theme. */
  vibe?: string;
  onVibeChange?: (value: string) => void;
  onVibeSubmit?: (vibe: string) => void;
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

export function SlideViewer({
  deck,
  activeIndex,
  onSelect,
  styledDeck,
  designLoading,
  designError,
  vibe,
  onVibeChange,
  onVibeSubmit,
}: SlideViewerProps) {
  const active = deck.slides[activeIndex];
  // Trust index-alignment (styleClient.ts's documented contract: "one
  // device + positioned elements per input slide, in the same order")
  // only when the styled deck's slide COUNT actually matches the plain
  // deck's — the API's response schema doesn't enforce this itself
  // (RawStyleSchema has no length/role-correspondence check), so a
  // malformed or partial response falls back to the plain stage entirely
  // rather than risk showing slide N's styled content under slide M's
  // thumbnail/notes.
  const alignedStyledDeck =
    styledDeck && styledDeck.slides.length === deck.slides.length ? styledDeck : undefined;
  const activeStyledSlide = alignedStyledDeck?.slides[activeIndex];
  const showVibeField = Boolean(styledDeck) && onVibeChange && onVibeSubmit;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ThumbnailRail
        slides={deck.slides}
        activeIndex={activeIndex}
        onSelect={onSelect}
      />

      {designLoading && (
        <div
          className="flex shrink-0 items-center gap-2 rounded-md border border-[#2a2a3a] bg-[#0f0f16] px-4 py-3 text-sm italic text-[#9ca3af]"
          aria-live="polite"
        >
          <span className="postr-busy-dot" aria-hidden="true" />
          <span>Styling your deck…</span>
        </div>
      )}
      {designError && (
        <p role="alert" className="shrink-0 rounded-md border border-[#3a2530] bg-[#1a1013] px-4 py-3 text-sm text-[#f87171]">
          Something went wrong. Showing your deck unstyled for now.
        </p>
      )}

      {active ? (
        activeStyledSlide && alignedStyledDeck ? (
          <StyledSlideStage
            slide={activeStyledSlide}
            palette={alignedStyledDeck.theme.palette}
            index={activeIndex}
          />
        ) : (
          <SlideStage slide={active} index={activeIndex} />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#2a2a3a] text-sm text-[#6b7280]">
          Your slides will appear here once the deck is built.
        </div>
      )}

      {showVibeField && (
        <div className="shrink-0">
          <VibeField value={vibe ?? ''} onChange={onVibeChange!} onSubmit={onVibeSubmit!} />
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

// Matches the pptx/pdf writers' widescreen canvas (deckWriter.ts's
// SLIDE_WIDTH_IN / SLIDE_HEIGHT_IN) so the preview's proportions are the
// same shape the exported files will be.
const STYLED_CANVAS_W_IN = 13.333;
const STYLED_CANVAS_H_IN = 7.5;

/** Shape-kind elements (rules, tracks, fills, boxes, dots) vs. text —
 *  mirrors deckWriter.ts's `addKnownElement` / deckPdf.ts's `isShapeKind`
 *  grouping so the live preview agrees with what gets exported. */
function isStyledShapeKind(kind: string): boolean {
  return (
    kind === 'background' ||
    kind.includes('rule') ||
    kind.includes('track') ||
    kind.includes('box') ||
    kind.includes('line') ||
    kind.includes('fill') ||
    kind.includes('dot')
  );
}

function toCssHex(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  return color.startsWith('#') ? color : `#${color}`;
}

/** One positioned element, rendered at the same (x, y) inches → percent
 *  of the canvas the pptx/pdf writers place it at. */
function StyledElementView({ element }: { element: StyledElement }) {
  const left = `${(element.x / STYLED_CANVAS_W_IN) * 100}%`;
  const top = `${(element.y / STYLED_CANVAS_H_IN) * 100}%`;

  if (element.kind === 'background') {
    return (
      <div
        className="absolute inset-0"
        style={{ backgroundColor: toCssHex(element.color, '#FFFFFF') }}
      />
    );
  }

  if (isStyledShapeKind(element.kind)) {
    return (
      <div
        className="absolute h-2 w-16 rounded-sm"
        style={{ left, top, backgroundColor: toCssHex(element.color, '#CCCCCC') }}
      />
    );
  }

  if (!element.text) return null;
  const isTitleLike = element.kind === 'title';
  return (
    <div
      className="absolute max-w-[85%]"
      style={{
        left,
        top,
        color: toCssHex(element.color, '#111111'),
        fontSize: element.fontSize ? `${Math.max(element.fontSize * 0.55, 9)}px` : undefined,
        fontWeight: isTitleLike ? 700 : 400,
      }}
    >
      {element.text}
    </div>
  );
}

/** The styled-deck stage — Task 10's replacement for the plain
 *  black-and-white `SlideStage` once the auto style+theme pass has run.
 *  Renders every positioned element on a background sized to the theme's
 *  own background color, mirroring the pptx/pdf writers' output shape
 *  closely enough that "what you see is what exports" holds. */
function StyledSlideStage({
  slide,
  palette,
  index,
}: {
  slide: StyledSlide;
  palette: string[];
  index: number;
}) {
  const backgroundHex = toCssHex(palette[0], '#FFFFFF');
  return (
    <div
      className="postr-rise-in relative min-h-0 flex-1 overflow-hidden rounded-lg border border-[#2a2a3a]"
      style={{ backgroundColor: backgroundHex, aspectRatio: `${STYLED_CANVAS_W_IN} / ${STYLED_CANVAS_H_IN}` }}
      aria-label={`Slide ${index + 1} preview (styled)`}
    >
      {slide.elements.map((el, i) => (
        <StyledElementView key={i} element={el} />
      ))}
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
