import { describe, it, expect } from 'vitest';
import { applyTheme } from '../applyTheme';
import type { StyledSlideDeck, Theme } from '../styledTypes';

const base: StyledSlideDeck = {
  durationMinutes: 10,
  theme: { palette: ['#ffffff', '#111111', '#999999'], typeScale: { heading: 20, body: 14, label: 10 }, accentTreatment: 'x' },
  slides: [{ role: 'result', device: 'callout', elements: [
    { kind: 'title', text: 'A finding', x: 0.7, y: 1.4, fontSize: 99, color: '#ff0000' },
    { kind: 'callout-box', x: 0.7, y: 4, color: '#00ff00' },
  ] }],
};
const theme: Theme = { palette: ['#faf9fc', '#1a1725', '#7c6aed', '#8b8798'], typeScale: { heading: 30, body: 18, label: 13 }, accentTreatment: 'slate' };

describe('applyTheme', () => {
  it('recolors elements to the theme palette (no red/green survives)', () => {
    const out = applyTheme(base, theme);
    const colors = out.slides[0]!.elements.map((e) => e.color);
    expect(colors).not.toContain('#ff0000');
    expect(colors).not.toContain('#00ff00');
    expect(colors.every((c) => !c || theme.palette.includes(c))).toBe(true);
  });
  it('re-sizes title text to the theme heading scale', () => {
    const out = applyTheme(base, theme);
    const title = out.slides[0]!.elements.find((e) => e.kind === 'title');
    expect(title?.fontSize).toBe(theme.typeScale.heading);
  });
  it('preserves structure — positions + text + device unchanged', () => {
    const out = applyTheme(base, theme);
    expect(out.slides[0]!.device).toBe('callout');
    expect(out.slides[0]!.elements[0]!.x).toBe(0.7);
    expect(out.slides[0]!.elements[0]!.text).toBe('A finding');
  });
  it('is pure — does not mutate the input', () => {
    const before = JSON.stringify(base);
    applyTheme(base, theme);
    expect(JSON.stringify(base)).toBe(before);
  });
});
