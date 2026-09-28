/**
 * Shared helpers for the fix-02 editor tests (sheetSize, posterSize).
 * Pure DOM/store helpers only: each test file keeps its own vi.mock calls,
 * because vitest hoists a mock only within the file that declares it.
 *
 * Every user-action helper ends with a task boundary. In a browser each
 * click and keystroke is its own task, and the store groups edits made in
 * ONE synchronous run into one undo step, so firing two actions back to
 * back without yielding would model a single action.
 */
import { expect } from 'vitest';
import { fireEvent, render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Block, PosterDoc } from '@postr/shared';
import { PosterEditor } from '../PosterEditor';
import { usePosterStore } from '@/stores/posterStore';
import { ACK_BLOCK_ID } from '@/export/ackBlock';

export class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

export const NAME = 'Lab meeting draft v3';
export const PX = 10; // editor units per inch

/** A poster with user content: every block has text the user wrote. */
export function makeDoc(widthIn = 48, heightIn = 36): PosterDoc {
  const base = { imageSrc: null, imageFit: 'contain' as const, tableData: null };
  return {
    version: 1,
    widthIn,
    heightIn,
    blocks: [
      { ...base, id: 't1', type: 'title', x: 20, y: 20, w: 440, h: 60, content: 'Effects of Sample Treatment' },
      { ...base, id: 'h1', type: 'heading', x: 20, y: 100, w: 210, h: 30, content: 'Methods we used' },
      { ...base, id: 'b1', type: 'text', x: 20, y: 140, w: 210, h: 80, content: 'Our own words, not a placeholder.' },
      { ...base, id: 'b2', type: 'text', x: 250, y: 140, w: 210, h: 80, content: 'A second column of results.' },
    ],
    fontFamily: 'Source Sans 3',
    palette: {
      bg: '#ffffff',
      primary: '#1a1a26',
      accent: '#7c6aed',
      accent2: '#4a6cf7',
      muted: '#6b7280',
      headerBg: '#f3f4f6',
      headerFg: '#1a1a26',
    },
    styles: {
      title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [{ id: 'a1', name: 'Jane Doe', affiliationIds: [] }],
    references: [],
  } as unknown as PosterDoc;
}

export function load(d: PosterDoc, opts: { seedAcknowledgement?: boolean } = {}) {
  usePosterStore.getState().setPoster('fixture-1', d, NAME, opts);
}

export function renderEditor(): RenderResult {
  return render(
    <MemoryRouter initialEntries={['/p/fixture']}>
      <PosterEditor />
    </MemoryRouter>,
  );
}

export const doc = () => usePosterStore.getState().doc!;
export const userBlocks = () => doc().blocks.filter((b) => b.id !== ACK_BLOCK_ID);
export const mark = () => doc().blocks.find((b) => b.id === ACK_BLOCK_ID);
export const q = <T extends Element>(sel: string) => document.querySelector(sel) as T;

/** In a browser every user action is its own task; model that. */
export const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function openTab(label: RegExp) {
  const tab = Array.from(document.querySelectorAll<HTMLElement>('[data-postr-tab]')).find((el) =>
    label.test((el.textContent ?? '').trim()),
  );
  if (!tab) throw new Error(`no sidebar tab matching ${label}`);
  fireEvent.click(tab);
}

/** A button by its visible label; a leading icon glyph (⬡, ✨) is ignored. */
export function findButton(text: string): HTMLButtonElement | undefined {
  const label = (s: string | null) => (s ?? '').trim().replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return Array.from(document.querySelectorAll('button')).find(
    (b) =>
      label(b.textContent) === text ||
      Array.from(b.querySelectorAll('span')).some((s) => label(s.textContent) === text),
  );
}

export async function click(el: Element | null | undefined, what: string) {
  if (!el) throw new Error(`nothing to click: ${what}`);
  fireEvent.click(el);
  await nextTask();
}

export const sizeMenu = () =>
  Array.from(document.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'custom'),
  ) as HTMLSelectElement;

export async function choosePreset(key: string) {
  fireEvent.change(sizeMenu(), { target: { value: key } });
  await nextTask();
}

export async function typeKeystrokes(input: HTMLInputElement, values: string[]) {
  for (const value of values) {
    fireEvent.change(input, { target: { value } });
    await nextTask();
  }
}

export async function pressEnter(input: HTMLInputElement) {
  fireEvent.keyDown(input, { key: 'Enter' });
  await nextTask();
}

export async function undoKey() {
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  await nextTask();
}

export const widthField = () => q<HTMLInputElement>('[aria-label="Poster width in inches"]');
export const heightField = () => q<HTMLInputElement>('[aria-label="Poster height in inches"]');

/**
 * The open confirmation dialog, found by its title the way a user reads it.
 * Returns null when nothing is asking.
 */
export function dialog(title: RegExp): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll('h1,h2,h3,[role="dialog"] *')).find((el) =>
    title.test((el.textContent ?? '').trim()),
  );
  if (!heading) return null;
  let box: HTMLElement | null = heading as HTMLElement;
  while (box && !Array.from(box.querySelectorAll('button')).some((b) => (b.textContent ?? '').trim() === 'Cancel')) {
    box = box.parentElement;
  }
  return box;
}
/** The dialog's action that is not Cancel. */
export const confirmButton = (box: HTMLElement) =>
  Array.from(box.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() !== 'Cancel');
export const cancelButton = (box: HTMLElement) =>
  Array.from(box.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Cancel');

/** Same relative position and proportions on the new sheet, within half a unit. */
export function expectMovedProportionally(before: Block[], fromIn: [number, number], toIn: [number, number]) {
  const sx = toIn[0] / fromIn[0];
  const sy = toIn[1] / fromIn[1];
  for (const b of before) {
    const a = doc().blocks.find((x) => x.id === b.id);
    expect(a, `block ${b.id} still exists`).toBeDefined();
    expect(a!.content, `block ${b.id} keeps its content`).toBe(b.content);
    expect(Math.abs(a!.x - b.x * sx), `${b.id}.x`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(a!.y - b.y * sy), `${b.id}.y`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(a!.w - b.w * sx), `${b.id}.w`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(a!.h - b.h * sy), `${b.id}.h`).toBeLessThanOrEqual(0.5);
  }
}

export const insideSheet = (b: Block) =>
  b.x >= 0 && b.y >= 0 && b.x + b.w <= doc().widthIn * PX && b.y + b.h <= doc().heightIn * PX;

