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

  it('assigns a theme color to a title/body/label element that starts with NO color at all — never leaves it invisible on the theme background', () => {
    // Arm P (styleDeck) does not always set `color` on every element — it's
    // Arm T's (applyTheme) job to colorize. An element with no color must
    // still get a real, theme-legible color, not stay undefined (which
    // upstream renderers fall back to a hardcoded near-black, invisible on
    // a dark theme background).
    const uncoloredDeck: StyledSlideDeck = {
      durationMinutes: 10,
      theme: base.theme,
      slides: [
        {
          role: 'title',
          device: 'plain',
          elements: [{ kind: 'title', text: 'Spaced practice', x: 0.7, y: 0.5, fontSize: 40 }],
        },
      ],
    };
    const darkTheme: Theme = {
      palette: ['#111111', '#FFFFFF', '#FFD700', '#999999'],
      typeScale: { heading: 48, body: 20, label: 13 },
      accentTreatment: 'bold',
    };
    const out = applyTheme(uncoloredDeck, darkTheme);
    const title = out.slides[0]!.elements[0]!;
    expect(title.color).toBe(darkTheme.palette[1]); // ink, not the bg color, not undefined
  });

  it('re-vibe (a SECOND applyTheme pass with a different theme) never strands ink text on the new background color', () => {
    // The bug this locks in: theme A's ink color (palette[1]) can
    // legitimately equal theme B's BACKGROUND color (palette[0]) — hex
    // strings recur across arbitrary palettes. A naive "keep the color
    // if it's already somewhere in the new palette" check would then
    // leave title text stuck in the new background's own color,
    // invisible. This is exactly SlidesWizard.tsx's handleVibeSubmit
    // path: re-run generateTheme, re-apply to the ALREADY-styled deck.
    const themeA: Theme = {
      palette: ['#FFFFFF', '#111111', '#7C6AED', '#6B7280'],
      typeScale: { heading: 40, body: 18, label: 12 },
      accentTreatment: 'light',
    };
    const themeB: Theme = {
      // Deliberately reuses themeA's ink color (#111111) as ITS OWN
      // background slot — the exact collision that breaks a naive fix.
      palette: ['#111111', '#FFFFFF', '#FFD700', '#999999'],
      typeScale: { heading: 48, body: 20, label: 13 },
      accentTreatment: 'bold',
    };
    const uncoloredDeck: StyledSlideDeck = {
      durationMinutes: 10,
      theme: themeA,
      slides: [
        {
          role: 'title',
          device: 'plain',
          elements: [{ kind: 'title', text: 'Spaced practice', x: 0.7, y: 0.5, fontSize: 40 }],
        },
      ],
    };

    const afterFirstStyle = applyTheme(uncoloredDeck, themeA);
    expect(afterFirstStyle.slides[0]!.elements[0]!.color).toBe(themeA.palette[1]); // '#111111'

    const afterReVibe = applyTheme(afterFirstStyle, themeB);
    const title = afterReVibe.slides[0]!.elements[0]!;
    // Must be theme B's ink (#FFFFFF), never theme B's background
    // (#111111) — even though #111111 is technically "in the palette".
    expect(title.color).toBe(themeB.palette[1]);
    expect(title.color).not.toBe(themeB.palette[0]);
  });
});
