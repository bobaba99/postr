/**
 * StyledSlideDeck domain types (Phase 2 — paper-to-slides).
 *
 * Shared data model consumed by two writers (PPTX + PDF). Arm P
 * (proposal-styling LLM) is prompted against the SUPPORTED_DEVICES
 * vocabulary to select an appropriate layout strategy for each slide.
 *
 * The writer implementations (deckWriter.ts) consume this type
 * to render slides with consistent styling across output formats.
 */

import type { SlideRole } from './types';

export type DeviceKind = 'plain' | 'quote-block' | 'progress-bar' | 'stat-emphasis' | 'callout';

export interface StyledElement {
  kind: string;
  text?: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
}

export interface StyledSlide {
  role: SlideRole;
  device: DeviceKind;
  elements: StyledElement[];
}

export interface Theme {
  palette: string[];
  typeScale: {
    heading: number;
    body: number;
    label: number;
  };
  accentTreatment: string;
}

export interface StyledSlideDeck {
  slides: StyledSlide[];
  theme: Theme;
  durationMinutes: number;
}

export const SUPPORTED_DEVICES: readonly DeviceKind[] = [
  'plain',
  'quote-block',
  'progress-bar',
  'stat-emphasis',
  'callout',
];
