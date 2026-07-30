/**
 * The unified acknowledgement mark, rasterized to PNG.
 *
 * Why PNG and not SVG: the PPTX writer and the PDF/print path are
 * raster-only. pptxgenjs feeds every image through an in-browser
 * `<img>` + canvas and SVG makes that throw, failing the whole export
 * (see docs/bugs/2026-07-28-pptx-export-svg-ack-mark.md). This module
 * exists so the ack mark can be embedded as a frozen PNG data URI with
 * no SVG anywhere in the export path.
 */
import { describe, expect, it } from 'vitest';
import { ackMarkPngDataUri } from '../ackMarkPng';

describe('ackMarkPngDataUri', () => {
  it('is a PNG data URI, never SVG', () => {
    const uri = ackMarkPngDataUri();
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(uri).not.toContain('svg');
  });

  it('carries a non-empty, decodable base64 payload', () => {
    const uri = ackMarkPngDataUri();
    const base64 = uri.slice('data:image/png;base64,'.length);
    expect(base64.length).toBeGreaterThan(0);
    // A real PNG begins with the 8-byte signature 89 50 4E 47 0D 0A 1A 0A,
    // whose base64 prefix is "iVBORw0KGgo".
    expect(base64.startsWith('iVBORw0KGgo')).toBe(true);
  });

  it('is a stable, deterministic constant (no per-call rasterization)', () => {
    expect(ackMarkPngDataUri()).toBe(ackMarkPngDataUri());
  });
});
