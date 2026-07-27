/**
 * ChatPane — renders the scripted interview: transcript bubbles, chip
 * options for closed question sets, and the text input (which doubles
 * as the manuscript paste box on the first step).
 *
 * Purely presentational — every transition happens in the parent via
 * the interviewer state machine.
 */
import { useEffect, useRef, useState } from 'react';
import { chipsFor, type InterviewState } from '../interviewer';

interface ChatPaneProps {
  state: InterviewState;
  busy: boolean;
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
          <div className="postr-rise-in max-w-[85%] rounded-lg bg-[#16161f] px-3.5 py-2.5 text-sm italic text-[#6b7280]">
            Drafting your poster text…
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
              className="rounded-full border border-[#3a3a4e] bg-[#16161f] px-3 py-1.5 text-left text-xs text-[#c8cad0] hover:border-[#7c6aed] hover:text-white"
            >
              {chip.label}
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
              disabled={busy}
              className="rounded-md border border-[#3a3a4e] px-3 py-1.5 text-xs font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white disabled:opacity-50"
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
            placeholder={
              isManuscriptStep
                ? 'Paste your manuscript here…'
                : 'Type your answer…'
            }
            rows={isManuscriptStep ? 6 : 2}
            disabled={busy}
            className="min-h-0 w-full resize-y rounded-md border border-[#2a2a3a] bg-[#0a0a12] px-3 py-2 text-sm text-[#c8cad0] outline-none focus:border-[#7c6aed] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !draft.trim()}
            className="rounded-md bg-[#7c6aed] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {isManuscriptStep ? 'Read it' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
