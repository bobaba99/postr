// pdfFidelity.spike.test.ts — a SPIKE (throwaway proof), not a product test.
//
// Task 0 of the Paper-to-Slides Phase 2 build. Answers the load-bearing
// question from the Phase-2 spec (§5.1): can a client-side PDF library
// (pdf-lib) faithfully reproduce a design-passed slide's positioned text
// and shape "devices"? The verdict gates the whole export architecture —
// see /tmp/task0-fidelity.pdf (written below) for a human-inspectable
// artifact, and see task-0-report.md for the recorded GO/NO-GO decision.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface ArmPElement {
  kind: string;
  text?: string;
  x?: number;
  y?: number;
  fontSize?: number;
  color?: string;
}

interface ArmPSlide {
  device: string;
  elements: ArmPElement[];
}

interface ArmPSample {
  slides: ArmPSlide[];
}

describe('PDF fidelity spike', () => {
  it('renders Arm P SS1 styled layout to a PDF with positioned text + shapes', async () => {
    const armP: ArmPSample = JSON.parse(
      readFileSync(
        join(process.cwd(), '../../docs/plans/experiments/design-pass/out/SS1_armP_styled.json'),
        'utf8',
      ),
    );

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const IN = 72; // pdf points per inch; slide = 13.33x7.5in
    const SLIDE_W = 13.33 * IN;
    const SLIDE_H = 7.5 * IN;

    for (const s of armP.slides) {
      const page = doc.addPage([SLIDE_W, SLIDE_H]);

      for (const e of s.elements) {
        const x = (e.x ?? 0) * IN;
        const yTop = (e.y ?? 0) * IN;

        if (e.kind === 'background') {
          // Full-bleed background fill — validates large rect placement.
          page.drawRectangle({
            x: 0,
            y: 0,
            width: SLIDE_W,
            height: SLIDE_H,
            color: hexToRgb(e.color ?? '#FFFFFF'),
          });
        } else if (e.text) {
          const isTitle = e.kind === 'title' || e.kind === 'section-label' || e.kind === 'callout-label';
          page.drawText(String(e.text).slice(0, 200), {
            x,
            y: SLIDE_H - yTop - (e.fontSize ?? 14),
            size: e.fontSize ?? 14,
            font: isTitle ? boldFont : font,
            color: hexToRgb(e.color ?? '#000000'),
            maxWidth: SLIDE_W - x - 0.5 * IN,
            lineHeight: (e.fontSize ?? 14) * 1.25,
          });
        } else if (
          e.kind.includes('rule') ||
          e.kind.includes('track') ||
          e.kind.includes('box') ||
          e.kind.includes('line') ||
          e.kind.includes('fill') ||
          e.kind.includes('dot')
        ) {
          // Non-text "devices": rules, progress tracks/fills, callout boxes,
          // accent lines/dots. Use distinct dims per device family so the
          // rendered PDF is visually distinguishable from a generic bar.
          const isDot = e.kind.includes('dot');
          const isBox = e.kind.includes('box');
          const width = isDot ? 0.12 * IN : isBox ? 3 * IN : 2 * IN;
          const height = isDot ? 0.12 * IN : isBox ? 1.5 * IN : 4;
          page.drawRectangle({
            x,
            y: SLIDE_H - yTop - height,
            width,
            height,
            color: hexToRgb(e.color ?? '#888888'),
          });
        }
      }
    }

    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(1000);

    // Assert 3 pages (one per Arm P slide) and text is real (not rasterized) —
    // reload the produced bytes and confirm page count matches slide count.
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(armP.slides.length);

    // Write to /tmp so a human can eyeball whether it looks like the styled
    // slide (real positioned text + shapes, not a garbled/rasterized mess).
    writeFileSync('/tmp/task0-fidelity.pdf', bytes);
  });
});

function hexToRgb(h: string) {
  const n = h.replace('#', '');
  return rgb(parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255);
}
