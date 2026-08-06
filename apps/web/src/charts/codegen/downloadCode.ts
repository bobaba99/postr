/**
 * Copy / download the generated R / Python for chart-chooser figures.
 * Code is FREE and carries NO watermark (unlike the image exports).
 *
 * Multi-select downloads a `.zip` of one script per figure (matching the
 * image ZIP behaviour); a single selection downloads one script file.
 * Copy always copies a single figure's code.
 */
import { zipSync } from 'fflate';
import type { ChartSpec } from '@postr/shared';
import { chartSpecToR } from './toR';
import { chartSpecToPython } from './toPython';
import type { DataMode } from './data';

export type CodeLang = 'r' | 'py';

const EXT: Record<CodeLang, string> = { r: 'R', py: 'py' };

export function generateCode(spec: ChartSpec, lang: CodeLang, mode: DataMode): string {
  return lang === 'r' ? chartSpecToR(spec, mode) : chartSpecToPython(spec, mode);
}

export async function copyCode(spec: ChartSpec, lang: CodeLang, mode: DataMode): Promise<void> {
  await navigator.clipboard.writeText(generateCode(spec, lang, mode));
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One script per figure. `entries[].stem` is the filename without extension. */
export function downloadCode(
  entries: readonly { spec: ChartSpec; stem: string }[],
  lang: CodeLang,
  mode: DataMode,
): void {
  if (entries.length === 0) throw new Error('no figures selected');
  const ext = EXT[lang];
  if (entries.length === 1) {
    const code = generateCode(entries[0]!.spec, lang, mode);
    const mime = lang === 'r' ? 'text/x-r-source' : 'text/x-python';
    triggerDownload(new Blob([code], { type: mime }), `${entries[0]!.stem}.${ext}`);
    return;
  }
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) {
    files[`${e.stem}.${ext}`] = new TextEncoder().encode(generateCode(e.spec, lang, mode));
  }
  const zipped = zipSync(files, { level: 6 });
  const buf = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
  triggerDownload(new Blob([buf], { type: 'application/zip' }), `figures-${ext}.zip`);
}
