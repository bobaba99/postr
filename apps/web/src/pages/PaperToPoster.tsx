/**
 * /paper-to-poster — the standalone route. Upload in, file out:
 * paste a manuscript (or drop a .docx), answer the scripted questions,
 * check the editable outline, download the poster as a PDF or a
 * `.postr` file. No editor step required — opening in the editor is an
 * option, not part of the loop.
 *
 * Slug history: shipped as `/manuscript-to-poster`, renamed to
 * `/paper-to-poster` on 2026-07-27 against measured keyword data
 * ("paper to poster" 140/mo · KD 0 · transactional). The old URL and
 * `/paper-to-present` both 308 here — see vercel.json and routes.tsx.
 * Output is a poster draft only; there is no slide/deck export.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CondensedNarrative } from '@postr/shared';
import { BusyIndicator, busyProps } from '@/components/BusyIndicator';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { ensureFontLoaded } from '@/poster/fontLoader';
import { DEFAULT_FONT_FAMILY, DEFAULT_PALETTE, PX } from '@/poster/constants';
import { parseManuscriptText } from '@/manuscript/parseManuscriptText';
import { DocxIngestError, ingestDocx } from '@/manuscript/docxIngest';
import {
  advance,
  assistantSay,
  closeChartPanel,
  createInterview,
  emphasisFor,
  ingestManuscript,
  type InterviewState,
} from '@/manuscript/interviewer';
import { ChartPanel } from '@/manuscript/ui/ChartPanel';
import { CondenseError, requestCondense } from '@/manuscript/condenseClient';
import { buildPosterDoc, type BuildPosterResult } from '@/manuscript/buildPoster';
import {
  checkFigure,
  measureImage,
  type FigureCheck,
} from '@/manuscript/figureCheck';
import { POSTER_ROLE_SPECS } from '@/manuscript/rubric';
import { exportPostr } from '@/import/postrFile';
import { ChatPane } from '@/manuscript/ui/ChatPane';
import {
  OutlineCard,
  type OutlineCutView,
  type OutlineEntryView,
} from '@/manuscript/ui/OutlineCard';
import { PosterStatic } from '@/manuscript/ui/PosterStatic';
import { openPosterPrintWindow } from '@/manuscript/ui/printPosterWindow';

const POSTER_CANVAS_ID = 'manuscript-poster-canvas';
/** Below this the paste is a note, not a manuscript. */
const MIN_MANUSCRIPT_WORDS = 50;

type Phase = 'interview' | 'condensing' | 'ready' | 'condense-error';

export default function PaperToPoster() {
  useDocumentMeta(STATIC_ROUTE_META['/paper-to-poster'] ?? null);

  const [interview, setInterview] = useState<InterviewState>(createInterview);
  const [phase, setPhase] = useState<Phase>('interview');
  const [entries, setEntries] = useState<OutlineEntryView[] | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [figureChecks, setFigureChecks] = useState<FigureCheck[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.5);

  useEffect(() => {
    ensureFontLoaded(DEFAULT_FONT_FAMILY);
  }, []);

  // ── Ingest ─────────────────────────────────────────────────────────
  const handleManuscriptText = useCallback(
    (text: string) => {
      if (interview.step !== 'manuscript') {
        setInterview((s) => advance(s, { kind: 'text', text }));
        return;
      }
      const doc = parseManuscriptText(text);
      if (doc.wordCount < MIN_MANUSCRIPT_WORDS) {
        setInterview((s) =>
          assistantSay(
            s,
            'That looks shorter than a manuscript — paste the full text (or upload the .docx) and I will take it from there.',
          ),
        );
        return;
      }
      setInterview((s) => ingestManuscript(s, doc));
    },
    [interview.step],
  );

  const handleDocxFile = useCallback(async (file: File) => {
    setIngesting(true);
    try {
      const doc = await ingestDocx(file);
      setInterview((s) => ingestManuscript(s, doc));
    } catch (error) {
      const code = error instanceof DocxIngestError ? error.code : 'parse_failed';
      setInterview((s) =>
        assistantSay(
          s,
          code === 'too_large'
            ? 'That file is too large. Export a lighter copy from Word, or paste the text instead.'
            : 'Something went wrong reading that file. Try exporting it again from Word, or paste the text instead.',
        ),
      );
    } finally {
      setIngesting(false);
    }
  }, []);

  // ── Condense (the single LLM call) ─────────────────────────────────
  const condense = useCallback(async (state: InterviewState) => {
    if (!state.map) return;
    const rolesToSend = state.map.roles.filter((r) => r.sourceText.trim());
    if (rolesToSend.length === 0) {
      setEntries(entriesFrom(state, { roles: [], pinned: [] }));
      setPhase('ready');
      return;
    }
    setPhase('condensing');
    try {
      const condensed = await requestCondense(
        state.map.roles,
        state.map.pinned,
        emphasisFor(state),
      );
      setEntries(entriesFrom(state, condensed));
      setPhase('ready');
    } catch (error) {
      const rateLimited =
        error instanceof CondenseError && error.kind === 'rate_limited';
      setInterview((s) =>
        assistantSay(
          s,
          rateLimited
            ? 'You have reached the daily drafting limit — try again later.'
            : 'Something went wrong drafting your poster text. You can try again, or use Send Feedback if it keeps happening.',
        ),
      );
      setPhase('condense-error');
    }
  }, []);

  // Reaching the outline step triggers the one condense call.
  useEffect(() => {
    if (interview.step === 'outline' && phase === 'interview') {
      void condense(interview);
    }
  }, [interview, phase, condense]);

  // ── Poster build (deterministic, re-runs on outline edits) ─────────
  const poster: BuildPosterResult | null = useMemo(() => {
    if (!interview.doc || !entries) return null;
    return buildPosterDoc(interview.doc, narrativeFrom(entries));
  }, [interview.doc, entries]);

  // ── Figure legibility gate (plan §4 non-negotiable #1) ─────────────
  // The user may never open the editor, so an illegible figure would
  // otherwise reach a print shop unflagged. Measured whenever the built
  // poster changes; stale results are dropped if the poster moves on.
  useEffect(() => {
    if (!poster) {
      setFigureChecks([]);
      return;
    }
    const imageBlocks = poster.doc.blocks.filter(
      (b) => b.type === 'image' && b.imageSrc,
    );
    if (imageBlocks.length === 0) {
      setFigureChecks([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      imageBlocks.map(async (block) => {
        const pixels = await measureImage(block.imageSrc!);
        return checkFigure(block.id, pixels, block.w / PX, block.h / PX);
      }),
    ).then((checks) => {
      if (!cancelled) setFigureChecks(checks);
    });
    return () => {
      cancelled = true;
    };
  }, [poster]);

  // Fit the natural-size canvas (1 poster unit = 1 CSS px at zoom 1)
  // to the preview pane width. Runs when the preview pane first
  // appears alongside the poster.
  const naturalWidthPx = poster ? poster.doc.widthIn * PX : null;
  useEffect(() => {
    const el = previewRef.current;
    if (!el || naturalWidthPx === null) return;
    const observer = new ResizeObserver(() => {
      setPreviewScale(Math.max(0.1, (el.clientWidth - 2) / naturalWidthPx));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [naturalWidthPx]);

  const handleEditEntry = useCallback((key: string, text: string) => {
    setEntries(
      (prev) =>
        prev?.map((e) => (e.key === key ? { ...e, text, truncated: false } : e)) ??
        prev,
    );
  }, []);

  // ── Downloads ──────────────────────────────────────────────────────
  const handleSavePdf = useCallback(() => {
    const container = document.getElementById(POSTER_CANVAS_ID);
    if (!container || !poster) return;
    const opened = openPosterPrintWindow({
      container,
      doc: poster.doc,
      title: interview.doc?.title || 'Poster',
    });
    if (!opened) {
      setInterview((s) =>
        assistantSay(
          s,
          'Your browser blocked the print window — allow popups for this site and try again.',
        ),
      );
    }
  }, [poster, interview.doc]);

  const handleDownloadPostr = useCallback(async () => {
    if (!poster) return;
    try {
      const blob = await exportPostr(poster.doc);
      const name = (interview.doc?.title || 'poster')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'poster'}.postr`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('postr export failed:', error);
      setInterview((s) =>
        assistantSay(
          s,
          'Something went wrong preparing the file. Try again, or use Send Feedback if it keeps happening.',
        ),
      );
    }
  }, [poster, interview.doc]);

  // Name the actual work — ingest and condense are different waits
  // with different durations, and "Drafting…" during a .docx unzip is
  // simply wrong.
  const busy = ingesting
    ? 'Reading your manuscript…'
    : phase === 'condensing'
      ? 'Drafting your poster text…'
      : null;
  // A passing figure needs no words — only problems get surfaced.
  const flaggedFigures = figureChecks.filter((c) => c.status !== 'pass');

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-6">
        {/* Must match routes.json "/paper-to-poster".h1 — the prerender
            script injects that string for non-JS crawlers, and a live
            heading that disagrees with the crawled one is the drift
            siteMeta.ts warns about. Change both together. */}
        <h1 className="text-2xl font-bold text-white">
          From paper to poster
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Paste your manuscript, answer a few short questions, download a
          poster draft — a structured first pass you can print or refine in
          the editor.
        </p>

        <div className="mt-5 flex flex-col gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[480px] lg:flex-row">
          {/* Chat shell */}
          <section
            aria-label="Interview"
            className="flex h-[460px] flex-col rounded-lg border border-[#1f1f2e] bg-[#0d0d15] lg:h-auto lg:w-[420px] lg:shrink-0"
          >
            <ChatPane
              state={interview}
              busy={busy}
              onSubmitText={handleManuscriptText}
              onChip={(chipId) =>
                setInterview((s) => advance(s, { kind: 'chip', chipId }))
              }
              onDocxFile={(file) => void handleDocxFile(file)}
            />
          </section>

          {/* Q2 plot branch — the chart chooser inline, so the user
              never leaves this page. Mounted only while the interview
              asked for it; the full tool is one link away inside. */}
          {interview.chartPanelOpen && (
            <div className="flex min-h-0 lg:w-[380px] lg:shrink-0">
              <ChartPanel
                doc={interview.doc}
                palette={DEFAULT_PALETTE}
                fontFamily={DEFAULT_FONT_FAMILY}
                onClose={() => setInterview(closeChartPanel)}
              />
            </div>
          )}

          {/* Outline + preview + downloads */}
          <section
            aria-label="Poster preview"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
          >
            {phase === 'condense-error' && (
              <button
                type="button"
                onClick={() => void condense(interview)}
                className="postr-rise-in self-start rounded-md bg-[#7c6aed] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Try drafting again
              </button>
            )}

            {entries && (
              <OutlineCard
                entries={entries}
                onEdit={handleEditEntry}
                cuts={cutsFrom(interview)}
              />
            )}

            {poster && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSavePdf}
                    className="rounded-md bg-[#7c6aed] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPostr()}
                    className="rounded-md border border-[#3a3a4e] px-4 py-2 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
                  >
                    Download .postr
                  </button>
                  <span className="text-[11px] text-[#6b7280]">
                    The .postr file opens in the editor for full control.
                  </span>
                </div>

                {/* Figure legibility — flagged AT DOWNLOAD TIME, next
                    to the buttons, because this is the single most
                    valuable thing the pipeline can tell a user. */}
                {flaggedFigures.length > 0 && (
                  <ul
                    aria-label="Figure legibility warnings"
                    className="postr-rise-in space-y-1 rounded-md border border-[#f9731633] bg-[#f9731611] px-3 py-2 text-xs text-[#fb923c]"
                  >
                    {flaggedFigures.map((check) => (
                      <li key={check.blockId}>{check.message}</li>
                    ))}
                  </ul>
                )}

                {poster.warnings.length > 0 && (
                  <ul className="postr-rise-in space-y-1 rounded-md border border-[#eab30833] bg-[#eab30811] px-3 py-2 text-xs text-[#eab308]">
                    {poster.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                )}

                <div
                  ref={previewRef}
                  className="postr-rise-in overflow-hidden rounded-lg border border-[#1f1f2e]"
                  style={{
                    height: poster.doc.heightIn * PX * previewScale + 2,
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <PosterStatic doc={poster.doc} containerId={POSTER_CANVAS_ID} />
                  </div>
                </div>
              </>
            )}

            {!entries && phase !== 'condense-error' && (
              <div
                className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#1f1f2e] p-8 text-center text-sm text-[#4b5563]"
                {...busyProps(phase === 'condensing')}
              >
                {phase === 'condensing' ? (
                  <BusyIndicator
                    label="Drafting your poster text…"
                    hint="This usually takes a few seconds."
                    style={{ alignItems: 'center', minWidth: 220 }}
                  />
                ) : (
                  'Your poster preview appears here once the questions are done.'
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Outline ↔ narrative mapping helpers
// ─────────────────────────────────────────────────────────────────────

function entriesFrom(
  state: InterviewState,
  condensed: CondensedNarrative,
): OutlineEntryView[] {
  const textByRole = new Map(condensed.roles.map((r) => [r.role, r]));
  const textByPin = new Map(condensed.pinned.map((p) => [p.id, p]));

  const roleEntries: OutlineEntryView[] = (state.map?.roles ?? []).map((role) => {
    const spec = POSTER_ROLE_SPECS[role.role];
    const reply = textByRole.get(role.role);
    return {
      key: role.role,
      kind: 'role',
      heading: spec.displayHeading,
      descriptor: spec.descriptor,
      provenance: role.sourceHeadings.join(', '),
      text: reply?.text ?? '',
      truncated: reply?.truncated ?? false,
      budgetWords: role.budgetWords,
      missing: role.missing && !reply?.text,
      reason: role.reason,
      isCore: role.tier === 1,
    };
  });

  const pinEntries: OutlineEntryView[] = (state.map?.pinned ?? []).map((pin) => {
    const reply = textByPin.get(pin.id);
    return {
      key: pin.id,
      kind: 'pinned',
      heading: pin.heading,
      descriptor: 'Pinned section',
      provenance: pin.heading,
      text: reply?.text ?? '',
      truncated: reply?.truncated ?? false,
      budgetWords: pin.budgetWords,
      missing: false,
      reason: pin.reason,
    };
  });

  return [...roleEntries, ...pinEntries];
}

/**
 * Sections the hierarchy left off, each with the one-phrase reason from
 * its relevance score. A cut should be a decision the user can see and
 * argue with, not a silent omission.
 */
function cutsFrom(state: InterviewState): OutlineCutView[] {
  const map = state.map;
  if (!map) return [];
  const reasonById = new Map(map.sectionScores.map((s) => [s.id, s.reason]));
  return map.cutSections.map((section) => ({
    key: section.id,
    heading: section.heading || 'Untitled section',
    reason: reasonById.get(section.id) ?? 'Little overlap with your main message',
  }));
}

function narrativeFrom(entries: OutlineEntryView[]): CondensedNarrative {
  return {
    roles: entries
      .filter((e) => e.kind === 'role')
      .map((e) => ({
        role: e.key as CondensedNarrative['roles'][number]['role'],
        text: e.text,
        truncated: e.truncated,
      })),
    pinned: entries
      .filter((e) => e.kind === 'pinned')
      .map((e) => ({
        id: e.key,
        heading: e.heading,
        text: e.text,
        truncated: e.truncated,
      })),
  };
}
