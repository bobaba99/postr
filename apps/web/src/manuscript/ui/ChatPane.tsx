/**
 * ChatPane — renders the scripted interview: transcript bubbles, chip
 * options for closed question sets, and the text input (which doubles
 * as the manuscript paste box on the first step).
 *
 * Purely presentational — every transition happens in the parent via
 * the interviewer state machine.
 */
import { useEffect, useRef, useState } from 'react';
import { busyProps } from '@/components/BusyIndicator';
import { chipsFor, type InterviewState, type InterviewStepId } from '../interviewer';

/** The steps where typing is the expected answer get their own prompt —
 *  a generic "Type your answer…" under a chip row reads as a dead end. */
function placeholderFor(step: InterviewStepId): string {
  switch (step) {
    case 'manuscript':
      return 'Paste your manuscript here…';
    case 'q3-audience-other':
      return 'e.g. school nurses, policymakers…';
    case 'q6-requirements':
      return 'e.g. 10 minutes, or 12 slides';
    default:
      return 'Type your answer…';
  }
}

interface ChatPaneProps {
  state: InterviewState;
  /**
   * What the pane is waiting on, in the user's words — "Reading your
   * manuscript…" during docx ingest, "Drafting your poster text…"
   * during the condense call. `null` when idle. It was a bare boolean
   * that always claimed to be drafting, which is a lie while we are
   * still unzipping a .docx.
   */
  busy: string | null;
  onSubmitText: (text: string) => void;
  onChip: (chipId: string) => void;
  onDocxFile: (file: File) => void;
}

export function ChatPane({
  state,
  busy,
  onSubmitText,
  onChip,
  onDocxFile,
}: ChatPaneProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isManuscriptStep = state.step === 'manuscript';
  const chips = chipsFor(state);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.transcript.length, busy]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    onSubmitText(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {state.transcript.map((turn, i) => (
          <div
            key={i}
            className={`postr-rise-in max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
              turn.speaker === 'assistant'
                ? 'bg-[#16161f] text-[#c8cad0]'
                : 'ml-auto bg-[#2b2456] text-[#e2e2e8]'
            }`}
          >
            {turn.text}
          </div>
        ))}
        {busy && (
          // The transcript container is already aria-live, so this
          // bubble must NOT nest its own live region — that would
          // announce the same line twice. The dot is decoration; the
          // text is what the outer region reads.
          <div
            className="postr-rise-in flex max-w-[85%] items-center gap-2 rounded-lg bg-[#16161f] px-3.5 py-2.5 text-sm italic text-[#9ca3af]"
            {...busyProps(true)}
          >
            <span className="postr-busy-dot" aria-hidden="true" />
            <span>{busy}</span>
          </div>
        )}
      </div>

      {chips.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChip(chip.id)}
              className="flex min-h-11 flex-col justify-center rounded-2xl border border-[#3a3a4e] bg-[#16161f] px-3.5 py-2 text-left text-sm text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
            >
              <span className="block">{chip.label}</span>
              {/* The qualifier the owner wanted ("covers conference /
                  department talk") lives here, NOT in the label —
                  chip labels stay terse. */}
              {chip.hint && (
                <span className="mt-0.5 block text-xs text-[#6b7280]">
                  {chip.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-[#1f1f2e] p-4">
        {isManuscriptStep && (
          <div className="mb-2">
            <input
              ref={fileRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onDocxFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white disabled:opacity-50"
            >
              Upload a .docx
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends on question steps; the manuscript paste
              // needs its newlines, so only the button sends there.
              if (e.key === 'Enter' && !e.shiftKey && !isManuscriptStep) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholderFor(state.step)}
            rows={isManuscriptStep ? 6 : 2}
            disabled={busy !== null}
            /* text-base (16px), not text-sm: iOS Safari zooms the page
               when a focused input is under 16px, and this is where the
               whole manuscript gets pasted. */
            className="min-h-0 w-full resize-y rounded-md border border-[#2a2a3a] bg-[#0a0a12] px-3 py-2 text-base text-[#c8cad0] outline-none focus:border-[#7c6aed] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy !== null || !draft.trim()}
            className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-[#7c6aed] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {isManuscriptStep ? 'Read it' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
