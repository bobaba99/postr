/**
 * Record 35 — the pure rules of block copy, cut and paste
 * (blockClipboard.ts; bounded-designs.md §3.3 table B order 1, table C, D;
 * docs/fixes/35-block-copy.md): the payload a copy writes, the strict
 * validation of an untrusted payload, the cleaning of its texts, the
 * refusals, the places, the words another application gets, and the file
 * paths of data/posterImages.ts. The entry tests (a keystroke, a paste,
 * ⌘D, Replace) are blockClipboardEntry.test.tsx.
 *
 * Re-run: npx vitest run src/poster/__tests__/blockClipboardRules.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { Block } from '@postr/shared';
import {
  CLIP_ATTR, CLIP_LIMITS, admit, chartsMessage, clipboardOf, copiedBlocks, copyOffset, fromClip, imagesLostMessage, keptOnSheet, pictureTravels,
  picturesStayMessage, readClip, refusalMessage, toClip, withCopiedFiles, wordsOf, type ClipBlock,
} from '../blockClipboard';
import { atPreDragGeometry } from '../dragStep';
import { readCanvasPaste } from '../canvasPaste';
import { copiedExt, imageExt, isPosterAssetSrc, newImagePath } from '@/data/posterImages';

const base = { imageSrc: null, imageFit: 'contain' as const, tableData: null, content: '' };
const blk = (over: Partial<Block> & Pick<Block, 'id' | 'type'>): Block => ({ x: 10, y: 20, w: 100, h: 40, ...base, ...over });
const SRC = 'storage://owner/fixture-1/im1.png';

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A marked payload as another page could write it. */
const marked = (json: unknown) => `<div ${CLIP_ATTR}="${attr(typeof json === 'string' ? json : JSON.stringify(json))}"><p>words</p></div>`;
const one = (b: Record<string, unknown>) => marked({ v: 1, blocks: [b] });
const textClip = (over: Record<string, unknown> = {}) => ({ id: 'a1', type: 'text', x: 10, y: 10, w: 100, h: 40, content: 'Hi', imageSrc: null, imageFit: 'contain', tableData: null, ...over });

describe('C1: what a copy writes', () => {
  it('a version 1 payload of the blocks in their order, each its original\'s id and fields; the words as plain text', () => {
    const blocks = [
      blk({ id: 'h1', type: 'heading', content: 'Methods' }),
      blk({ id: 'b1', type: 'text', content: 'One <b>bold</b><br>two' }),
      blk({ id: 'im1', type: 'image', imageSrc: SRC, caption: 'A <i>cat</i>' }),
      blk({ id: 'tb1', type: 'table', tableData: { rows: 2, cols: 2, cells: ['A', 'B', '1', '2'], colWidths: null, borderPreset: 'apa' } }),
    ];
    const { html, text } = clipboardOf(blocks);
    const read = readClip(html);
    expect(read?.payload?.v).toBe(1);
    expect(read!.payload!.blocks.map((b) => b.id)).toEqual(['h1', 'b1', 'im1', 'tb1']);
    expect(read!.payload!.blocks[1]).toEqual({ id: 'b1', type: 'text', x: 10, y: 20, w: 100, h: 40, content: 'One <b>bold</b><br>two', imageSrc: null, imageFit: 'contain', tableData: null });
    expect(read!.payload!.blocks[2]!.imageSrc).toBe(SRC);
    expect(read!.payload!.blocks[3]!.tableData).toEqual(blocks[3]!.tableData);
    expect(text).toBe('Methods\n\nOne bold\ntwo\n\nA cat\n\nA\tB\n1\t2');
  });

  it('copies every kind but the credit mark and charts, and counts the charts', () => {
    const blocks = [
      blk({ id: 'b1', type: 'text' }),
      blk({ id: '__postr_ack_mark__', type: 'logo', locked: true, imageSrc: 'data:image/png;base64,AAAA' }),
      blk({ id: 'c1', type: 'chart' }),
      blk({ id: 'lg', type: 'logo' }),
    ];
    const all = new Set(blocks.map((b) => b.id));
    expect(copiedBlocks(blocks, all)).toEqual({ blocks: [blocks[0], blocks[3]], charts: 1 });
    expect(copiedBlocks(blocks, new Set(['__postr_ack_mark__']))).toEqual({ blocks: [], charts: 0 });
  });

  it('an image source travels only when it is a poster-assets file; another (a data URL, an address) is written as \'\'', () => {
    expect(toClip(blk({ id: 'l1', type: 'logo', imageSrc: 'data:image/png;base64,AAAA' })).imageSrc).toBe('');
    expect(toClip(blk({ id: 'l1', type: 'logo', imageSrc: 'https://upload.wikimedia.org/x.png' })).imageSrc).toBe('');
    expect(toClip(blk({ id: 'l1', type: 'logo', imageSrc: SRC })).imageSrc).toBe(SRC);
    expect(toClip(blk({ id: 'l1', type: 'logo' })).imageSrc).toBeNull();
    expect(toClip(blk({ id: 't1', type: 'text', imageSrc: SRC })).imageSrc).toBeNull();
  });

  it('a copy of the poster\'s own blocks is always a valid payload (an optional field that would fail is left out)', () => {
    const odd = blk({ id: 'b1', type: 'text', rotation: Number.NaN, captionGap: 400, prompt: 'Type here' });
    const read = readClip(clipboardOf([odd]).html);
    expect(read?.payload?.blocks[0]).toMatchObject({ id: 'b1', prompt: 'Type here' });
    expect(read!.payload!.blocks[0]).not.toHaveProperty('rotation');
    expect(read!.payload!.blocks[0]).not.toHaveProperty('captionGap');
  });

  it('a stored table of an odd shape is written in the payload\'s shape (one cell per place, widths only one per column, a known preset)', () => {
    const odd = blk({ id: 'tb', type: 'table', tableData: { rows: 2, cols: 2, cells: ['a', 'b', 'c'], colWidths: [100], borderPreset: 'gone', extra: 1 } as unknown as Block['tableData'] });
    const read = readClip(clipboardOf([odd]).html);
    expect(read?.payload?.blocks[0]!.tableData).toEqual({ rows: 2, cols: 2, cells: ['a', 'b', 'c', ''], colWidths: null, borderPreset: 'apa' });
  });

  it('the words: a table\'s cells by tabs and rows, a caption and a note; authors and references have none of their own', () => {
    expect(wordsOf(blk({ id: 'i', type: 'image', caption: 'Cap', note: 'N<sup>2</sup>' }))).toEqual(['Cap', 'N2']);
    expect(wordsOf(blk({ id: 'a', type: 'authors' }))).toEqual([]);
    expect(wordsOf(blk({ id: 'l', type: 'text', content: '<ul><li>one</li><li>two</li></ul>' }))).toEqual(['one', 'two']);
  });
});

describe('table B order 1: a marked payload is read first', () => {
  const data = (html: string, text = 'words') => ({ getData: (t: string) => (t === 'text/html' ? html : t === 'text/plain' ? text : ''), items: [], files: [] });

  it('a valid payload is order 1 (before a table and before text)', () => {
    const html = `${one(textClip())}<table><tr><td>a</td></tr></table>`;
    expect(readCanvasPaste(data(html))?.kind).toBe('blocks');
  });

  it('a payload that fails is still order 1, with nothing to paste (no fall-through to the text row)', () => {
    expect(readCanvasPaste(data(one(textClip({ x: 1e308 }))))).toEqual({ kind: 'blocks', payload: null });
  });

  it('HTML without the mark is not order 1', () => {
    expect(readCanvasPaste(data('<p>data-postr-blocks is just words here</p>'))?.kind).toBe('text');
  });
});

describe('C6: an untrusted payload is validated strictly', () => {
  const fails = (html: string) => expect(readClip(html)).toEqual({ payload: null });

  it('a valid block passes', () => {
    expect(readClip(one(textClip()))?.payload?.blocks).toHaveLength(1);
  });
  it('another version, other keys at the top, no blocks, malformed JSON', () => {
    fails(marked({ v: 2, blocks: [textClip()] }));
    fails(marked({ v: 1, blocks: [textClip()], extra: 1 }));
    fails(marked({ v: 1, blocks: [] }));
    fails(marked('{"v":1,"blocks":['));
    fails(marked([textClip()]));
  });
  it('more than 200 blocks, or a payload over 2 000 000 characters', () => {
    fails(marked({ v: 1, blocks: Array.from({ length: CLIP_LIMITS.blocks + 1 }, () => textClip()) }));
    expect(readClip(marked({ v: 1, blocks: Array.from({ length: CLIP_LIMITS.blocks }, () => textClip()) }))?.payload).not.toBeNull();
    // 200 blocks each within the text bound, over 2 000 000 characters together: only the payload bound refuses it.
    const big = Array.from({ length: CLIP_LIMITS.blocks }, () => textClip({ content: 'x'.repeat(10_050) }));
    expect(JSON.stringify({ v: 1, blocks: big }).length).toBeGreaterThan(CLIP_LIMITS.json);
    fails(marked({ v: 1, blocks: big }));
  });
  it('numbers: not finite-looking, out of range, a size of 0 or less, a string for a number', () => {
    fails(one(textClip({ x: 1e308 })));
    fails(one(textClip({ y: -10_001 })));
    fails(one(textClip({ w: 0 })));
    fails(one(textClip({ h: -5 })));
    fails(one(textClip({ x: '10' })));
    fails(one(textClip({ rotation: 400 })));
    fails(one(textClip({ captionGap: -1 })));
    fails(one(textClip({ crop: { top: 101, right: 0, bottom: 0, left: 0 } })));
    fails(one(textClip({ crop: { top: -1, right: 0, bottom: 0, left: 0 } })));
    expect(readClip(one(textClip({ x: -10_000, w: 10_000 })))?.payload).not.toBeNull();
  });
  it('an unknown type (a chart too), an unknown field, `locked`, a missing field, a field of the wrong kind', () => {
    fails(one(textClip({ type: 'iframe' })));
    fails(one(textClip({ type: 'chart' })));
    fails(one(textClip({ onclick: 'x' })));
    fails(one(textClip({ locked: true })));
    fails(one(textClip({ chartSpec: null })));
    fails(one({ ...textClip(), content: undefined }));
    fails(one(textClip({ imageFit: 'stretch' })));
    fails(one(textClip({ captionPosition: 'middle' })));
    fails(one(textClip({ id: '../x' })));
    fails(one(JSON.parse('{"id":"a1","type":"text","x":1,"y":1,"w":1,"h":1,"content":"","imageSrc":null,"imageFit":"contain","tableData":null,"__proto__":{"x":1}}')));
  });
  it('texts over their bounds', () => {
    fails(one(textClip({ content: 'x'.repeat(CLIP_LIMITS.text + 1) })));
    fails(one(textClip({ prompt: 'x'.repeat(CLIP_LIMITS.prompt + 1) })));
    fails(one(textClip({ imageSrc: `data:${'x'.repeat(5000)}` })));
  });
  it('tables: their own shape, one cell per place, the bounds, a known border preset', () => {
    const t = (tableData: unknown) => one(textClip({ type: 'table', tableData }));
    expect(readClip(t({ rows: 1, cols: 2, cells: ['a', 'b'], colWidths: [40, 60], borderPreset: 'apa' }))?.payload).not.toBeNull();
    fails(t(null));
    fails(t({ rows: 1, cols: 2, cells: ['a'], colWidths: null, borderPreset: 'apa' }));
    fails(t({ rows: 0, cols: 2, cells: [], colWidths: null, borderPreset: 'apa' }));
    fails(t({ rows: 51, cols: 50, cells: Array(2550).fill(''), colWidths: null, borderPreset: 'apa' }));
    fails(t({ rows: 1, cols: 2, cells: ['a', 'b'], colWidths: [50], borderPreset: 'apa' }));
    fails(t({ rows: 1, cols: 2, cells: ['a', 'b'], colWidths: null, borderPreset: 'constructor' }));
    fails(t({ rows: 1, cols: 2, cells: ['a', 7], colWidths: null, borderPreset: 'apa' }));
    fails(t({ rows: 1, cols: 2, cells: ['a', 'b'], colWidths: null, borderPreset: 'custom', customBorder: { topLine: 'yes' } }));
  });
  it('a source that is not a poster-assets file is not a failure (the block is pasted empty)', () => {
    expect(readClip(one(textClip({ type: 'image', imageSrc: 'javascript:alert(1)' })))?.payload).not.toBeNull();
  });
});

describe('C6: what a payload block becomes', () => {
  const evil = '<img src=x onerror="alert(1)">ZQ <b>bold</b><script>alert(2)</script><a href="javascript:alert(3)">L</a>';
  it('every text cleaned by the editor\'s sanitizer; the prompt plain text; a new id', () => {
    const c = textClip({ content: evil, caption: evil, note: evil, prompt: '"><img src=x onerror=alert(1)>Type' }) as unknown as ClipBlock;
    const { block } = fromClip(c, 'bNEW');
    expect(block.id).toBe('bNEW');
    for (const t of [block.content, block.caption, block.note]) {
      expect(t).not.toMatch(/<img|onerror|<script|javascript:|<a[\s>]/i);
      expect(t).toContain('ZQ <b>bold</b>');
    }
    expect(block.prompt).toBe('">Type');
  });
  it('table cells cleaned', () => {
    const c = textClip({ type: 'table', tableData: { rows: 1, cols: 1, cells: [evil], colWidths: null, borderPreset: 'apa' } }) as unknown as ClipBlock;
    expect(fromClip(c, 'b2').block.tableData!.cells[0]).not.toMatch(/<img|<script|javascript:/i);
  });
  it('an image keeps only a poster-assets source, to copy; any other is lost', () => {
    const img = (imageSrc: unknown) => fromClip(textClip({ type: 'image', imageSrc }) as unknown as ClipBlock, 'b3');
    expect(img(SRC)).toMatchObject({ src: SRC, lost: false, block: { imageSrc: null } });
    for (const s of ['javascript:x', 'data:image/png;base64,AA', 'http://zq.invalid/a.png', '', 'storage://../../etc/passwd', 'storage://a/b/c/d.png', 'storage://a/b/c.png.exe']) {
      expect(img(s)).toMatchObject({ src: null, lost: true, block: { imageSrc: null } });
    }
    expect(img(null)).toMatchObject({ src: null, lost: false });
    // A text block's source is never kept.
    expect(fromClip(textClip({ imageSrc: SRC }) as unknown as ClipBlock, 'b4')).toMatchObject({ src: null, lost: false, block: { imageSrc: null } });
  });
});

describe('C3 and C4: places and refusals', () => {
  const poster = [blk({ id: 't1', type: 'title' }), blk({ id: 'a1', type: 'authors' }), blk({ id: 'b1', type: 'text' })];
  it('1 in down and right while an original is on the poster, else in place', () => {
    expect(copyOffset([{ id: 'b1' }], poster)).toBe(10);
    expect(copyOffset([{ id: 'zz' }, { id: 'b1' }], poster)).toBe(10);
    expect(copyOffset([{ id: 'zz' }], poster)).toBe(0);
  });
  it('kept on the sheet; at 0 when larger than the sheet', () => {
    const sheet = { w: 480, h: 360 };
    expect(keptOnSheet({ x: 470, y: 340, w: 100, h: 40 }, 0, sheet)).toEqual({ x: 380, y: 320 });
    expect(keptOnSheet({ x: 375, y: 315, w: 100, h: 40 }, 10, sheet)).toEqual({ x: 380, y: 320 });
    expect(keptOnSheet({ x: 10, y: 10, w: 600, h: 40 }, 0, sheet)).toEqual({ x: 0, y: 10 });
    expect(keptOnSheet({ x: -50, y: -50, w: 100, h: 40 }, 0, sheet)).toEqual({ x: 0, y: 0 });
    expect(keptOnSheet({ x: 100, y: 100, w: 100, h: 40 }, 10, sheet)).toEqual({ x: 110, y: 110 });
  });
  it('a title, authors or user logo refused when the poster has one; the paste\'s own second one too; the credit mark is not a logo', () => {
    const pasted = [blk({ id: 'x1', type: 'title' }), blk({ id: 'x2', type: 'heading' }), blk({ id: 'x3', type: 'authors' }), blk({ id: 'x4', type: 'logo' }), blk({ id: 'x5', type: 'logo' })];
    expect(admit(pasted, poster)).toEqual({ kept: [pasted[1], pasted[3]], refused: ['title', 'authors', 'logo'] });
    const withMark = [...poster, blk({ id: '__postr_ack_mark__', type: 'logo', locked: true })];
    expect(admit([pasted[3]!], withMark)).toEqual({ kept: [pasted[3]], refused: [] });
    expect(admit([pasted[3]!], [...poster, blk({ id: 'lg', type: 'logo' })])).toEqual({ kept: [], refused: ['logo'] });
    expect(admit(pasted.slice(0, 2), [])).toEqual({ kept: pasted.slice(0, 2), refused: [] });
  });
  it('the toasts say why', () => {
    expect(refusalMessage(['title'])).toBe('Not pasted: the poster already has a title.');
    expect(refusalMessage(['title', 'authors', 'logo'])).toBe('Not pasted: the poster already has a title, an authors block and a logo.');
    expect(imagesLostMessage(1)).toBe('1 image couldn\'t be copied, so its block is empty.');
    expect(imagesLostMessage(3)).toBe('3 images couldn\'t be copied, so their blocks are empty.');
  });
});

describe('D: image file paths', () => {
  it('a poster-assets path has three parts of id characters and an extension', () => {
    expect(isPosterAssetSrc('storage://owner/fixture-1/im1.png')).toBe(true);
    expect(isPosterAssetSrc('storage://0f8f/b2c3/im1-AbC_9-xY.jpeg')).toBe(true);
    for (const s of ['storage://a/b.png', 'storage://a/b/c/d.png', 'storage://a/../c.png', 'storage://a/b/c', 'https://x/a/b/c.png', 'storage://a/b/c.PNG', null, 42]) {
      expect(isPosterAssetSrc(s)).toBe(false);
    }
  });
  it('a new path per call: {user}/{poster}/{block}-{random}.{ext}', () => {
    const a = newImagePath('u', 'p', 'b1', 'png');
    expect(a).toMatch(/^u\/p\/b1-[A-Za-z0-9_-]{8}\.png$/);
    expect(newImagePath('u', 'p', 'b1', 'png')).not.toBe(a);
    expect(isPosterAssetSrc(`storage://${a}`)).toBe(true);
  });
  it('the extension: the file\'s own when plain, else its type\'s, else png', () => {
    expect(imageExt({ name: 'Fig.JPG', type: 'image/jpeg' })).toBe('jpg');
    expect(imageExt({ name: 'logo', type: 'image/svg+xml' })).toBe('svg');
    expect(imageExt({ name: 'a.b c', type: 'image/webp' })).toBe('webp');
    expect(imageExt({ name: 'noext', type: 'application/x' })).toBe('png');
  });
});

describe('review round 1 (record 35 §9)', () => {
  const table = (id: string, rows: number, cols: number) => textClip({ id, type: 'table', tableData: { rows, cols, cells: Array(rows * cols).fill(''), colWidths: null, borderPreset: 'apa' } });
  it('R1-1: the payload\'s tables hold at most 2 500 cells in all (the bound of one table)', () => {
    expect(CLIP_LIMITS.cellsInAll).toBe(2_500);
    expect(readClip(marked({ v: 1, blocks: [table('t1', 50, 50)] }))?.payload).not.toBeNull();
    expect(readClip(marked({ v: 1, blocks: [table('t1', 25, 50), table('t2', 25, 50)] }))?.payload).not.toBeNull();
    expect(readClip(marked({ v: 1, blocks: [table('t1', 25, 50), table('t2', 25, 50), table('t3', 1, 1)] }))?.payload).toBeNull();
    expect(readClip(marked({ v: 1, blocks: Array.from({ length: 200 }, (_, i) => table(`t${i}`, 50, 50)) }))?.payload).toBeNull();
  });

  it('R1-2: a picture travels when it has no source or a poster-assets file; an address or a data URL does not', () => {
    expect(pictureTravels(blk({ id: 'l', type: 'logo', imageSrc: SRC }))).toBe(true);
    expect(pictureTravels(blk({ id: 'l', type: 'logo' }))).toBe(true);
    expect(pictureTravels(blk({ id: 'l', type: 'logo', imageSrc: 'https://upload.wikimedia.org/x.png' }))).toBe(false);
    expect(pictureTravels(blk({ id: 'i', type: 'image', imageSrc: 'data:image/png;base64,AAAA' }))).toBe(false);
    expect(pictureTravels(blk({ id: 't', type: 'text', imageSrc: 'https://x/y.png' }))).toBe(true);
    expect(picturesStayMessage(1)).toBe('1 picture stays on the canvas: it can\'t be pasted back.');
    expect(picturesStayMessage(2)).toBe('2 pictures stay on the canvas: they can\'t be pasted back.');
  });

  it('R1-3: a file this app wrote under an older name ({block}.{the file name\'s extension, lowercased}) is a poster-assets file; nothing that steps out of a folder is', () => {
    for (const ok of ['storage://owner/p1/im1.plot_final', 'storage://owner/p1/im1.jpg_large', 'storage://owner/p1/im1.screen shot', 'storage://owner/p1/im1.png']) {
      expect(isPosterAssetSrc(ok)).toBe(true);
    }
    for (const bad of [
      'storage://owner/p1/im1.png?x=1', 'storage://owner/p1/im1.a#b', 'storage://owner/p1/im1.a%2Fb', 'storage://owner/p1/x..png', 'storage://owner/p1/.png',
      'storage://owner/p1/im1. png', 'storage://owner/p1/im1.png ', 'storage://owner/p1/im1.png\n', 'storage://owner/p1/im1.a\\b', 'STORAGE://owner/p1/im1.png',
      'storage://owner/p1/im1.PNG', 'storage://owner//im1.png', 'storage://owner/p1/sub/im1.png', 'storage://owner/../im1.png',
    ]) {
      expect(isPosterAssetSrc(bad)).toBe(false);
    }
    expect(copiedExt('owner/p1/im1.plot_final')).toBe('png');
    expect(copiedExt('owner/p1/im1-AbCdEfGh.jpeg')).toBe('jpeg');
  });

  it('R1-7: the charts toast says how many', () => {
    expect(chartsMessage(1)).toBe('Charts can\'t be copied, so the chart was left out.');
    expect(chartsMessage(3)).toBe('Charts can\'t be copied, so the charts were left out.');
  });
});

describe('review round 2 (record 35 §9)', () => {
  it('R2-2: a crop the editor stores (a side up to 90 %: CropOverlay keeps 10 % of the picture) is carried and pasted as stored', () => {
    const cropped = blk({ id: 'im1', type: 'image', imageSrc: SRC, crop: { top: 0, right: 0, bottom: 0, left: 60 } });
    const read = readClip(clipboardOf([cropped]).html);
    expect(read?.payload?.blocks[0]!.crop).toEqual({ top: 0, right: 0, bottom: 0, left: 60 });
    expect(fromClip(read!.payload!.blocks[0]!, 'n1').block.crop).toEqual({ top: 0, right: 0, bottom: 0, left: 60 });
    expect(readClip(one(textClip({ crop: { top: 90, right: 0, bottom: 10, left: 0 } })))?.payload).not.toBeNull();
    expect(readClip(one(textClip({ crop: { top: 100, right: 100, bottom: 100, left: 100 } })))?.payload).not.toBeNull();
  });

  it('R2-2\'s sibling: a custom border of an older stored shape (no inner lines, an unknown key) is carried in its known fields, drawn the same, not left out', () => {
    const older = { topLine: true, bottomLine: 1, leftLine: false, rightLine: true, headerLine: true, headerBox: false, outerBorder: true } as unknown as NonNullable<NonNullable<Block['tableData']>['customBorder']>;
    const tb = blk({ id: 'tb', type: 'table', tableData: { rows: 3, cols: 2, cells: ['a', 'b', 'c', 'd', 'e', 'f'], colWidths: null, borderPreset: 'custom', customBorder: older } });
    const read = readClip(clipboardOf([tb]).html);
    expect(read?.payload?.blocks[0]!.tableData!.customBorder).toEqual({ topLine: true, bottomLine: true, leftLine: false, rightLine: true, headerLine: true, headerBox: false, innerH: [], innerV: [] });
    const whole = { topLine: false, bottomLine: true, leftLine: false, rightLine: false, headerLine: true, headerBox: true, innerH: [true], innerV: [false] };
    expect(toClip(blk({ id: 'tb', type: 'table', tableData: { ...tb.tableData!, customBorder: whole } })).tableData!.customBorder).toEqual(whole);
  });

  it('R2-3: more than 200 blocks make no payload, so ⌘C and ⌘X refuse them (R1-4\'s rule)', () => {
    const many = Array.from({ length: 201 }, (_, i) => blk({ id: `t${i}`, type: 'text', content: 'w' }));
    expect(readClip(clipboardOf(many).html)?.payload).toBeNull();
    expect(readClip(clipboardOf(many.slice(0, 200)).html)?.payload?.blocks).toHaveLength(200);
  });
});

describe('review round 3 (record 35 §9)', () => {
  it('R3-3: a copied file takes the place of the source only where a block shows it; a refused copy (null) empties it there', () => {
    const steps = [
      [blk({ id: 'p1', type: 'image', imageSrc: SRC }), blk({ id: 'p2', type: 'image', imageSrc: SRC })],
      [blk({ id: 'p1', type: 'image', imageSrc: 'storage://owner/fixture-1/p1-REPLACED.png' })],
      [blk({ id: 't1', type: 'text', content: 'w' })],
    ];
    const own = 'storage://owner/fixture-1/p1-abcdefgh.png';
    expect(steps.map((b) => withCopiedFiles(b, [{ id: 'p1', from: SRC, to: own }])?.map((x) => x.imageSrc) ?? null)).toEqual([[own, SRC], null, null]);
    expect(withCopiedFiles(steps[0]!, [{ id: 'p2', from: SRC, to: null }])?.map((x) => x.imageSrc)).toEqual([SRC, null]);
    expect(withCopiedFiles(steps[0]!, [{ id: 'p1', from: SRC, to: SRC }])).toBeNull();
  });

  it('R3-3\'s sibling: a drag\'s undo step is the blocks as they are at release with their geometry from pointerdown (place, size, rotation); other fields as they are now', () => {
    const before = [
      blk({ id: 'a', type: 'image', x: 10, y: 20, w: 100, h: 40, imageSrc: SRC }),
      blk({ id: 'b', type: 'text', x: 5, y: 5, rotation: 15 }),
      blk({ id: 'c', type: 'text' }),
    ];
    const own = 'storage://owner/fixture-1/a-abcdefgh.png';
    const now = [
      { ...before[0]!, x: 60, y: 70, w: 130, h: 52, imageSrc: own },
      { ...before[1]!, rotation: 90 },
      { ...before[2]!, x: 33, rotation: 45 },
      blk({ id: 'd', type: 'text', x: 1 }),
    ];
    const step = atPreDragGeometry(now, before);
    expect(step[0]).toEqual({ ...before[0], imageSrc: own });
    expect(step[1]).toEqual(before[1]);
    expect(step[2]).toEqual(before[2]);
    expect('rotation' in step[2]!).toBe(false);
    expect(step[3]).toBe(now[3]);
    const unchanged = atPreDragGeometry(before, before);
    expect(unchanged.every((b, i) => b === before[i])).toBe(true);
  });
});
