import { describe, it, expect } from 'vitest';
import { SUPPORTED_DEVICES, type StyledSlideDeck } from '../styledTypes';

describe('styled model', () => {
  it('fixes the supported device vocabulary', () => {
    expect(SUPPORTED_DEVICES).toContain('plain');
    expect(SUPPORTED_DEVICES).toContain('progress-bar');
    expect(SUPPORTED_DEVICES).toContain('callout');
  });
  it('a StyledSlideDeck carries slides + theme', () => {
    const d: StyledSlideDeck = { durationMinutes: 10, theme: { palette: ['#fff','#000','#7c6aed'], typeScale: { heading: 30, body: 18, label: 13 }, accentTreatment: 'slate' }, slides: [] };
    expect(d.theme.palette.length).toBeGreaterThan(2);
  });
});
