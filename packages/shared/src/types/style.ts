/**
 * Copy-a-design contract (docs/plans/2026-07-27-design-style-extraction.md).
 *
 * The content/style boundary is enforced by this SCHEMA, not by a
 * prompt: every field is an enum, a number, or a hex colour. There is
 * no free-text field, so the extractor has no mechanism to carry the
 * source poster's words. The server asserts this shape with a strict
 * zod schema (apps/api/src/extractStyle.ts) and the closure is unit-
 * tested there.
 *
 * Phase 1 ships colours + fonts only; `typeScale`, `headingTreatment`
 * and `layout` join this interface in Phases 2–3 of the plan.
 */
import type { Palette } from './poster';

/**
 * The ten curated font families. This union is the single source of
 * truth for "curated" across packages:
 *   - `apps/web/src/poster/constants.ts` types its `FONTS` record as
 *     `Record<CuratedFontFamily, FontFamily>`, so web cannot drift.
 *   - `apps/api/src/extractStyle.ts` keeps a runtime copy (the API
 *     bundle cannot import runtime values from this TS-source-only
 *     package) pinned to this union with compile-time asserts.
 */
export type CuratedFontFamily =
  | 'Source Sans 3'
  | 'DM Sans'
  | 'IBM Plex Sans'
  | 'Fira Sans'
  | 'Libre Franklin'
  | 'Outfit'
  | 'Charter'
  | 'Literata'
  | 'Source Serif 4'
  | 'Lora';

/**
 * Design properties lifted from an uploaded poster image by the
 * `extract-style` vision mode. Colours are 6-digit hex; nothing in
 * this shape can express the source poster's content.
 */
export interface ExtractedStyle {
  version: 1;
  /**
   * Closest curated family, or `null` when the model's answer failed
   * the server-side enum assert (plan §5: impossible by construction,
   * but asserted anyway). `null` means "keep the current family".
   */
  fontFamily: CuratedFontFamily | null;
  /** Seven-role palette as reported by the model (role assignment).
   *  The client snaps these values to the pixel-clustered colours
   *  before applying (plan §3.1). */
  palette: Palette;
  /** Model's own 0–1 confidence — surfaced to the user, never hidden. */
  confidence: number;
}
