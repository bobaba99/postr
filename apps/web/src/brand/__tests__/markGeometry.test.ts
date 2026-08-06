import { describe, it, expect } from 'vitest';
import {
  MARK_VIEWBOX,
  MARK_PATH_RISE,
  MARK_PATH_FALL,
  MARK_DOT,
  MARK_STROKE_WIDTH,
  MARK_COLORS,
  markInnerSvg,
  markSvg,
} from '../markGeometry';

describe('mark geometry — golden guard', () => {
  it('is a true square: both curves span the same 40-unit extent, centred', () => {
    // Rise + fall must span x:12→52 and y:12→52 — a 40×40 square in the 64 box.
    expect(MARK_PATH_RISE).toContain('M12 52');
    expect(MARK_PATH_RISE).toContain('52 12');
    expect(MARK_PATH_FALL).toContain('M12 12');
    expect(MARK_PATH_FALL).toContain('52 52');
  });

  it('dot sits dead-centre of the viewBox', () => {
    expect(MARK_DOT.cx).toBe(MARK_VIEWBOX / 2);
    expect(MARK_DOT.cy).toBe(MARK_VIEWBOX / 2);
  });

  it('dot is larger than the stroke so it caps the crossing (diameter > stroke width)', () => {
    expect(MARK_DOT.r * 2).toBeGreaterThan(MARK_STROKE_WIDTH);
  });

  it('brand tone uses strong + light purples', () => {
    const svg = markInnerSvg('brand');
    expect(svg).toContain(MARK_COLORS.strong);
    expect(svg).toContain(MARK_COLORS.light);
  });

  it('mono tone defaults to muted grey and uses ONE colour (no purple)', () => {
    const svg = markInnerSvg('mono');
    expect(svg).toContain(MARK_COLORS.muted);
    expect(svg).not.toContain(MARK_COLORS.strong);
    expect(svg).not.toContain(MARK_COLORS.light);
  });

  it('mono tone honours a colour override', () => {
    const svg = markInnerSvg('mono', { color: '#123456' });
    expect(svg).toContain('#123456');
  });

  it('purple background renders the mark in white', () => {
    const svg = markSvg(64, { background: 'purple' });
    expect(svg).toContain(`fill="${MARK_COLORS.strong}"`); // the tile
    expect(svg).toContain(MARK_COLORS.onDark); // white mark
  });

  it('white background renders a bordered tile with the brand mark', () => {
    const svg = markSvg(64, { background: 'white' });
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain(MARK_COLORS.strong);
  });

  it('transparent (default) has no background rect', () => {
    const svg = markSvg(32);
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('width="32"');
  });
});
