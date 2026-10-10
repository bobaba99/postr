/**
 * The box an image block draws its picture in, in inches (fix 13b), which
 * is what the plot checker scales a figure to in the editor: not the block.
 *
 * blocks.tsx draws every block in a frame with a 1-unit border (border-box,
 * 0.1 in a side; the 1.5-unit border of a selected block is the editor's
 * only), and an image block's CaptionWrapper puts a left or right caption
 * in 35% of the frame's width, the picture in the rest after the caption
 * gap. A top or bottom caption, or a note, adds height and keeps the
 * picture `block.h` tall; with neither, the picture fills the frame. The
 * picture is fitted inside this box (object-fit: contain), so the checker's
 * min(width / canvas width, height / canvas height) is its print scale.
 * The confirmer measured the side caption's cost at 37% of the printed
 * width (record 13b).
 */
import type { Block } from '@postr/shared';
import { PX } from './constants';

/** The frame's border, in poster units, each side (blocks.tsx BlockFrame). */
const FRAME_BORDER = 1;
/** A left or right caption's share of the frame's width (blocks.tsx CaptionWrapper). */
const SIDE_CAPTION_SHARE = 0.35;

export function printedImageBox(block: Pick<Block, 'w' | 'h' | 'captionPosition' | 'captionGap' | 'note'>): { widthIn: number; heightIn: number } {
  const position = block.captionPosition ?? 'top';
  const side = position === 'left' || position === 'right';
  const inner = block.w - 2 * FRAME_BORDER;
  const gap = side ? Math.max(0, Math.min(24, block.captionGap ?? 0)) : 0;
  const width = side ? inner * (1 - SIDE_CAPTION_SHARE) - gap : inner;
  const chrome = position !== 'none' || !!block.note;
  const height = chrome ? block.h : block.h - 2 * FRAME_BORDER;
  return { widthIn: Math.max(0.1, width) / PX, heightIn: Math.max(0.1, height) / PX };
}
