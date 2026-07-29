/**
 * ConstraintsStep — the wizard's first step (spec §2, Turn 1).
 *
 * Collects the three things the deck cannot be built without: the manuscript
 * text (pasted, or a dropped .docx reusing the shared ingest), the talk
 * duration in minutes (slide count = 1/min), and the export format the user
 * is aiming for. Nothing here calls the pipeline — the parent runs extraction
 * when the user advances. The manuscript never leaves the browser at this
 * step (privacy line lives in the shell), so the paste box is local state
 * lifted to the parent via `onChange`.
 *
 * Errors are generic on purpose (house rule): a failed .docx read surfaces
 * "Something went wrong reading that file." — never the raw parser message.
 */
import { useRef, useState } from 'react';
import { ingestDocx } from '../docxIngest';
import { parseManuscriptText } from '../parseManuscriptText';
import type { DocumentModel } from '@postr/shared';

/** The talk output format. Phase 1 builds one black-and-white deck for both;
 *  the choice is captured now so the export drawer can lead with it. */
export type OutputFormat = 'pptx' | 'pdf';

export interface ConstraintsValue {
  manuscriptText: string;
  durationMinutes: number;
  format: OutputFormat;
}

interface ConstraintsStepProps {
  value: ConstraintsValue;
  onChange: (next: ConstraintsValue) => void;
  /** A .docx was parsed into a DocumentModel — its text fills the paste box
   *  so the single downstream parse path (pasted text) stays authoritative. */
  onDocxParsed: (model: DocumentModel, plainText: string) => void;
  disabled?: boolean;
}

/** Flatten a parsed model back to plain text so the paste box shows what was
 *  read and the parent re-parses through one path. Title, then section
 *  headings + paragraphs, then references — enough to re-derive the model. */
function modelToPlainText(model: DocumentModel): string {
  const lines: string[] = [];
  if (model.title) lines.push(model.title, '');
  if (model.authors.length > 0) {
    lines.push(model.authors.map((a) => a.name).join(', '), '');
  }
  if (model.abstract) lines.push('Abstract', model.abstract, '');
  for (const section of model.sections) {
    if (section.heading) lines.push(section.heading);
    lines.push(...section.paragraphs, '');
  }
  if (model.references.length > 0) {
    lines.push('References');
    lines.push(...model.references.map((r) => r.rawText ?? '').filter(Boolean));
  }
  return lines.join('\n').trim();
}

const DURATION_OPTIONS = [5, 10, 15, 20, 30];

export function ConstraintsStep({
  value,
  onChange,
  onDocxParsed,
  disabled = false,
}: ConstraintsStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const handleDocx = async (file: File) => {
    setFileError(null);
    setReading(true);
    try {
      const model = await ingestDocx(file);
      const plainText = modelToPlainText(model);
      onDocxParsed(model, plainText);
    } catch {
      // Generic — the specific DocxIngestError code never reaches the UI.
      setFileError('Something went wrong reading that file. Try pasting the text instead.');
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="p2s-manuscript"
          className="mb-1.5 block text-sm font-semibold text-[#e2e2e8]"
        >
          Manuscript
        </label>
        <textarea
          id="p2s-manuscript"
          value={value.manuscriptText}
          onChange={(e) =>
            onChange({ ...value, manuscriptText: e.target.value })
          }
          placeholder="Paste your manuscript here…"
          rows={8}
          disabled={disabled || reading}
          /* text-base (16px) so iOS Safari does not zoom the whole page when
             this — the manuscript paste box — takes focus. */
          className="w-full resize-y rounded-md border border-[#2a2a3a] bg-[#0a0a12] px-3 py-2 text-base text-[#c8cad0] outline-none focus:border-[#7c6aed] disabled:opacity-50"
        />
        <div className="mt-2 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleDocx(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || reading}
            className="inline-flex min-h-11 items-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white disabled:opacity-50"
          >
            {reading ? 'Reading…' : 'Upload a .docx'}
          </button>
          {fileError && (
            <p role="alert" className="text-xs text-[#f87171]">
              {fileError}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <label
            htmlFor="p2s-duration"
            className="mb-1.5 block text-sm font-semibold text-[#e2e2e8]"
          >
            Talk length
          </label>
          <select
            id="p2s-duration"
            value={value.durationMinutes}
            onChange={(e) =>
              onChange({ ...value, durationMinutes: Number(e.target.value) })
            }
            disabled={disabled}
            className="min-h-11 rounded-md border border-[#2a2a3a] bg-[#0a0a12] px-3 text-sm text-[#c8cad0] outline-none focus:border-[#7c6aed] disabled:opacity-50"
          >
            {DURATION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[#6b7280]">
            One slide per minute — {value.durationMinutes} content slides.
          </p>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-[#e2e2e8]">
            Aiming for
          </span>
          <div className="flex gap-2">
            {(['pptx', 'pdf'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onChange({ ...value, format: fmt })}
                aria-pressed={value.format === fmt}
                disabled={disabled}
                className={`min-h-11 rounded-md border px-4 text-sm font-semibold disabled:opacity-50 ${
                  value.format === fmt
                    ? 'border-[#7c6aed] bg-[#16161f] text-white'
                    : 'border-[#2a2a3a] bg-[#0a0a12] text-[#c8cad0] hover:border-[#3a3a4e]'
                }`}
              >
                {fmt === 'pptx' ? 'PowerPoint' : 'PDF'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Parse the paste box's text into a DocumentModel — the single downstream
 *  path for both pasted and .docx-derived text. */
export function parseConstraints(manuscriptText: string): DocumentModel {
  return parseManuscriptText(manuscriptText);
}
