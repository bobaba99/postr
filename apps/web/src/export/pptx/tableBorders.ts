/**
 * Table cell border mapping for the PPTX writer — a pure mirror of
 * `cellBorder` in blocks.tsx (the canvas renderer), translated to
 * pptxgenjs `BorderProps` arrays in [top, right, bottom, left]
 * order. Named presets AND the per-line custom mode are supported,
 * so the exported table shows the same rules the canvas draws.
 */
import type { Palette, TableData } from '@postr/shared';
import { TABLE_BORDER_PRESETS } from '@/poster/constants';
import { cssColorToHex6 } from '../richText';

export interface PptxBorder {
  type: 'none' | 'solid';
  color?: string;
  pt?: number;
}

export type CellBorders = [PptxBorder, PptxBorder, PptxBorder, PptxBorder];

const NONE: PptxBorder = { type: 'none' };

/** Canvas px → points at poster scale (the canvas draws hairlines in
 *  CSS px on a 1-unit-per-px canvas; these are thin rules either way). */
const THIN_PT = 0.75; // canvas 0.8px hairline
const HEAVY_PT = 1.5; // canvas 1.5px preset rule
const MID_PT = 1; // canvas 1px header rule

interface ResolvedFlags {
  isCustom: boolean;
  horizontalLines: boolean;
  verticalLines: boolean;
  outerBorder: boolean;
  headerLine: boolean;
  topLine: boolean;
  bottomLine: boolean;
  headerBox: boolean;
  leftEdge: boolean;
  rightEdge: boolean;
  innerH: readonly boolean[];
  innerV: readonly boolean[];
}

function resolveFlags(data: TableData): ResolvedFlags {
  const cb = data.customBorder;
  const isCustom = data.borderPreset === 'custom' && !!cb;
  if (isCustom) {
    return {
      isCustom,
      horizontalLines: false,
      verticalLines: false,
      outerBorder: !!cb!.leftLine || !!cb!.rightLine,
      headerLine: !!cb!.headerLine,
      topLine: !!cb!.topLine,
      bottomLine: !!cb!.bottomLine,
      headerBox: !!cb!.headerBox,
      leftEdge: !!cb!.leftLine,
      rightEdge: !!cb!.rightLine,
      innerH: cb!.innerH ?? [],
      innerV: cb!.innerV ?? [],
    };
  }
  const preset = TABLE_BORDER_PRESETS[data.borderPreset] ?? TABLE_BORDER_PRESETS['apa']!;
  return {
    isCustom: false,
    horizontalLines: preset.horizontalLines,
    verticalLines: preset.verticalLines,
    outerBorder: preset.outerBorder,
    headerLine: preset.headerLine,
    topLine: preset.topLine,
    bottomLine: preset.bottomLine,
    headerBox: preset.headerBox,
    leftEdge: preset.outerBorder,
    rightEdge: preset.outerBorder,
    innerH: [],
    innerV: [],
  };
}

/**
 * Borders for cell (r, c) — [top, right, bottom, left], mirroring
 * the canvas renderer rule-for-rule. `scale` is the PPTX geometry
 * scale (0.5 for halved posters) applied to rule weights so a
 * half-size file prints back at the intended weight at 200%.
 */
export function tableCellBorders(
  data: TableData,
  r: number,
  c: number,
  palette: Palette,
  scale: number,
): CellBorders {
  const f = resolveFlags(data);
  const mutedHex = cssColorToHex6(palette.muted) ?? '888888';
  const primaryHex = cssColorToHex6(palette.primary) ?? '111111';
  const thin: PptxBorder = { type: 'solid', color: mutedHex, pt: THIN_PT * scale };
  const heavy: PptxBorder = { type: 'solid', color: primaryHex, pt: HEAVY_PT * scale };
  const mid: PptxBorder = { type: 'solid', color: primaryHex, pt: MID_PT * scale };

  let top: PptxBorder = NONE;
  let right: PptxBorder = NONE;
  let bottom: PptxBorder = NONE;
  let left: PptxBorder = NONE;

  if (f.leftEdge && c === 0) left = thin;
  if (f.rightEdge && c === data.cols - 1) right = thin;
  if (f.topLine && r === 0) top = heavy;
  if (f.headerLine && r === 1) top = mid;
  if (f.bottomLine && r === data.rows - 1) bottom = heavy;

  if (f.isCustom) {
    // innerH[i] = the gap below data row i+1, so the TOP of row r
    // (r ≥ 2) reads innerH[r - 2]; innerV[i] = gap right of col i,
    // so the LEFT of col c reads innerV[c - 1].
    if (r > 1 && f.innerH[r - 2] === true) top = thin;
    if (c > 0 && f.innerV[c - 1] === true) left = thin;
  } else {
    if (f.outerBorder) {
      if (r === 0) top = thin;
      if (r === data.rows - 1) bottom = thin;
    }
    if (f.horizontalLines && r > 0) top = thin;
    if (f.verticalLines && c > 0) left = thin;
  }

  if (f.headerBox && r === 0) {
    top = heavy;
    bottom = mid;
    if (c === 0) left = mid;
    if (c === data.cols - 1) right = mid;
  }

  return [top, right, bottom, left];
}
