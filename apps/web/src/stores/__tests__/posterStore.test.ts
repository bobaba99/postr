/**
 * Tests for the Zustand poster store.
 *
 * The store is the single source of truth for the in-memory PosterDoc
 * being edited. Every mutation must be IMMUTABLE — never reach in and
 * mutate a block in place. The store is consumed by:
 *   - the Canvas (renders blocks)
 *   - the Sidebar tabs (read + dispatch mutations)
 *   - the autosave hook (subscribes and upserts to Supabase)
 *
 * Phase 2.3 only covers the in-memory model. Phase 4 layers persistence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { usePosterStore } from '../posterStore';
import type { PosterDoc, Block } from '@postr/shared';

function makeDoc(): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    blocks: [],
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
    authors: [],
    references: [],
  };
}

function makeBlock(id: string, overrides: Partial<Block> = {}): Block {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    content: '',
    imageSrc: null,
    imageFit: 'contain',
    tableData: null,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset store between tests so state doesn't leak.
  usePosterStore.setState({ doc: null, posterId: null });
});

describe('posterStore', () => {
  describe('setPoster', () => {
    it('replaces the current doc', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);

      expect(usePosterStore.getState().posterId).toBe('p1');
      expect(usePosterStore.getState().doc).toEqual(doc);
    });
  });

  describe('addBlock', () => {
    it('appends a block immutably', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);
      const before = usePosterStore.getState().doc;

      usePosterStore.getState().addBlock(makeBlock('b1'));

      const after = usePosterStore.getState().doc;
      expect(after?.blocks).toHaveLength(1);
      expect(after?.blocks[0]?.id).toBe('b1');
      // immutability check: original reference still has 0 blocks
      expect(before?.blocks).toHaveLength(0);
      // and the doc reference itself changed
      expect(after).not.toBe(before);
    });

    it('is a no-op when no doc is loaded', () => {
      usePosterStore.getState().addBlock(makeBlock('b1'));
      expect(usePosterStore.getState().doc).toBeNull();
    });
  });

  describe('updateBlock', () => {
    it('replaces a block by id immutably', () => {
      const doc = { ...makeDoc(), blocks: [makeBlock('b1', { content: 'hello' })] };
      usePosterStore.getState().setPoster('p1', doc);
      const beforeBlocks = usePosterStore.getState().doc?.blocks;

      usePosterStore.getState().updateBlock('b1', { content: 'world' });

      const after = usePosterStore.getState().doc;
      expect(after?.blocks[0]?.content).toBe('world');
      // original blocks array reference is untouched
      expect(beforeBlocks?.[0]?.content).toBe('hello');
    });

    it('leaves other blocks alone', () => {
      const doc = {
        ...makeDoc(),
        blocks: [makeBlock('b1'), makeBlock('b2', { x: 50 })],
      };
      usePosterStore.getState().setPoster('p1', doc);

      usePosterStore.getState().updateBlock('b1', { x: 10 });

      const blocks = usePosterStore.getState().doc?.blocks;
      expect(blocks?.[0]?.x).toBe(10);
      expect(blocks?.[1]?.x).toBe(50);
    });
  });

  describe('removeBlock', () => {
    it('removes a block by id', () => {
      const doc = {
        ...makeDoc(),
        blocks: [makeBlock('b1'), makeBlock('b2')],
      };
      usePosterStore.getState().setPoster('p1', doc);

      usePosterStore.getState().removeBlock('b1');

      const blocks = usePosterStore.getState().doc?.blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks?.[0]?.id).toBe('b2');
    });
  });

  describe('setStyle', () => {
    it('updates a single style level immutably', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);
      const before = usePosterStore.getState().doc?.styles;

      usePosterStore.getState().setStyle('title', { size: 80 });

      const after = usePosterStore.getState().doc?.styles;
      expect(after?.title.size).toBe(80);
      // other levels untouched
      expect(after?.body.size).toBe(18);
      // immutability
      expect(before?.title.size).toBe(60);
    });
  });

  describe('setPalette', () => {
    it('replaces the palette', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);

      usePosterStore.getState().setPalette({
        bg: '#000',
        primary: '#fff',
        accent: '#0f0',
        accent2: '#00f',
        muted: '#888',
        headerBg: '#111',
        headerFg: '#eee',
      });

      expect(usePosterStore.getState().doc?.palette.bg).toBe('#000');
    });
  });

  describe('setFont', () => {
    it('updates fontFamily', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);

      usePosterStore.getState().setFont('Lora');

      expect(usePosterStore.getState().doc?.fontFamily).toBe('Lora');
    });
  });

  describe('applyExtractedStyle', () => {
    const copiedPalette = {
      bg: '#FAFDF7',
      primary: '#1B3A2D',
      accent: '#2D6A4F',
      accent2: '#52B788',
      muted: '#5A6E5F',
      headerBg: '#2D6A4F',
      headerFg: '#FFFFFF',
    };

    it('applies palette + font as a SINGLE undo step', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);

      usePosterStore.getState().applyExtractedStyle({
        palette: copiedPalette,
        fontFamily: 'Lora',
      });

      const after = usePosterStore.getState();
      expect(after.doc?.palette).toEqual(copiedPalette);
      expect(after.doc?.fontFamily).toBe('Lora');
      expect(after.canUndo).toBe(true);

      // One undo reverts BOTH fields — the copy-a-design escape hatch.
      usePosterStore.getState().undo();
      const reverted = usePosterStore.getState();
      expect(reverted.doc?.palette).toEqual(doc.palette);
      expect(reverted.doc?.fontFamily).toBe(doc.fontFamily);
      expect(reverted.canUndo).toBe(false);
    });

    it('applies only the fields present in the patch', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);

      usePosterStore.getState().applyExtractedStyle({ palette: copiedPalette });

      const after = usePosterStore.getState();
      expect(after.doc?.palette).toEqual(copiedPalette);
      expect(after.doc?.fontFamily).toBe(doc.fontFamily);
    });

    it('is a no-op (no undo entry) for an empty patch', () => {
      usePosterStore.getState().setPoster('p1', makeDoc());

      usePosterStore.getState().applyExtractedStyle({});

      expect(usePosterStore.getState().canUndo).toBe(false);
    });

    it('redo restores both fields together', () => {
      const doc = makeDoc();
      usePosterStore.getState().setPoster('p1', doc);
      usePosterStore.getState().applyExtractedStyle({
        palette: copiedPalette,
        fontFamily: 'Lora',
      });

      usePosterStore.getState().undo();
      usePosterStore.getState().redo();

      const after = usePosterStore.getState();
      expect(after.doc?.palette).toEqual(copiedPalette);
      expect(after.doc?.fontFamily).toBe('Lora');
    });
  });
});

describe('F3 — typing must not evict structural history', () => {
  beforeEach(() => {
    usePosterStore.getState().setPoster('p1', makeDoc(), 'T');
  });

  it('keeps a deletion reachable after a sentence is typed', () => {
    // The repro from FINDINGS.md F3: delete a heading, type ~78
    // characters, then undo. Every `input` event committed a whole-
    // document snapshot, and MAX_HISTORY = 50 evicted oldest-first — so
    // the deletion was gone before the user finished the sentence, with
    // autosave having already persisted it.
    const store = usePosterStore.getState();
    store.addBlock(makeBlock('heading'));
    store.addBlock(makeBlock('body'));
    store.removeBlock('heading');
    expect(usePosterStore.getState().doc!.blocks.find((b) => b.id === 'heading')).toBeUndefined();

    const sentence = 'Participants completed the task for twelve weeks and were scored by two raters.';
    expect(sentence.length).toBeGreaterThanOrEqual(78);
    for (let i = 1; i <= sentence.length; i++) {
      usePosterStore.getState().updateBlock('body', { content: sentence.slice(0, i) });
    }

    // What the user does: press undo until the heading comes back.
    // Before coalescing, 78 keystrokes filled all 50 slots and evicted
    // the three structural entries, so it never came back at all.
    let recovered = false;
    for (let i = 0; i < 200 && usePosterStore.getState().canUndo; i++) {
      usePosterStore.getState().undo();
      if (usePosterStore.getState().doc!.blocks.some((b) => b.id === 'heading')) {
        recovered = true;
        break;
      }
    }
    expect(recovered).toBe(true);
    // And it took a handful of presses, not fifty.
    expect(usePosterStore.getState().doc!.blocks.some((b) => b.id === 'body')).toBe(true);
  });

  it('collapses a typing burst into a single undo entry', () => {
    const store = usePosterStore.getState();
    store.addBlock(makeBlock('body'));
    for (let i = 1; i <= 20; i++) {
      usePosterStore.getState().updateBlock('body', { content: 'x'.repeat(i) });
    }
    // One undo should clear the whole burst, not one character.
    usePosterStore.getState().undo();
    const content = usePosterStore.getState().doc!.blocks.find((b) => b.id === 'body')!.content;
    expect(content).toBe('');
  });

  it('does not merge edits to two different blocks', () => {
    const store = usePosterStore.getState();
    store.addBlock(makeBlock('a'));
    store.addBlock(makeBlock('b'));
    usePosterStore.getState().updateBlock('a', { content: 'aaa' });
    usePosterStore.getState().updateBlock('b', { content: 'bbb' });

    usePosterStore.getState().undo();
    const blocks = usePosterStore.getState().doc!.blocks;
    // Only b's edit is undone; a's survives.
    expect(blocks.find((x) => x.id === 'b')!.content).toBe('');
    expect(blocks.find((x) => x.id === 'a')!.content).toBe('aaa');
  });

  it('does not merge a content edit with a structural change', () => {
    const store = usePosterStore.getState();
    store.addBlock(makeBlock('a'));
    usePosterStore.getState().updateBlock('a', { content: 'hello' });
    usePosterStore.getState().updateBlock('a', { w: 999 });

    usePosterStore.getState().undo();
    const a = usePosterStore.getState().doc!.blocks.find((x) => x.id === 'a')!;
    // The resize is undone; the typing is not.
    expect(a.w).not.toBe(999);
    expect(a.content).toBe('hello');
  });
});
