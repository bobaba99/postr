import type { HeadingStyle, Palette, Styles } from './poster';

export type PresetSource = 'manual' | 'scanned';

/** Matches prototype in-memory preset shape. Persisted in `presets.data`. */
export interface PresetData {
  fontFamily: string;
  palette: Palette;
  styles: Styles;
  headingStyle: HeadingStyle;
}

export interface Preset {
  id: string;
  userId: string;
  name: string;
  source: PresetSource;
  data: PresetData;
  thumbnailPath: string | null;
  createdAt: string;
}

/** Shape returned by /api/scan — see PRD §16. */
export interface ScannedPreset {
  name: string;
  fontFamily: string;
  palette: Palette;
  styles: Styles;
  headingStyle: HeadingStyle;
  layoutHint?: '3-col' | '2-col' | 'billboard' | 'sidebar' | 'blank';
}
