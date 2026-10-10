/**
 * simplify-check's hide-switch scenarios (record docs/fixes/29-mvp-simplify.md,
 * bounded-designs.md §5.2 item 1, owner decisions D3 and D4): every control
 * the three switches hide, counted where a user meets it, beside the
 * controls that stay (a hidden count above 0 is the claim; a kept count of
 * 0 is a claim too); the values the hidden controls stay at; and a poster
 * whose stored rotation, crop, stretch, borders, colours, weights and line
 * heights must still draw.
 */
import { DEFAULT_DATA } from './guestBackend.mjs';
import { focusBlockEnd, openTab, selectFrame, selectLastWord } from './undoKit.mjs';
import { rowOf } from './keepWorkKit.mjs';
import { countProbes, deselect, openStoredPoster, promptStates } from './simplifyKit.mjs';

const SIDE = '[data-postr-sidebar]';
const t = (text, extra = {}) => ({ text, ...extra });
const inSide = (text, extra = {}) => ({ text, within: SIDE, ...extra });

/** Probes per place: `hide` must count 0 while the switches are off, `keep` must count above 0. */
const PLACES = {
  layout: {
    hide: {
      importTile: { sel: '[data-postr-import-tile]' },
      showGrid: inSide('^Show grid$', { sel: 'label' }),
      gridDrawn: { sel: '[data-postr-overlay="grid"]', dom: true },
      guidelines: { sel: '[data-postr-guidelines], [data-postr-guidelines-toggle]', dom: true },
      editorDuplicate: { sel: 'button[title="Duplicate this poster"]' },
    },
    keep: { autoArrange: inSide('Auto-Arrange', { sel: 'button' }), templates: inSide('3-Column Classic', { sel: 'button' }) },
  },
  style: {
    hide: {
      copyDesign: inSide('Copy a design', { sel: 'button' }),
      customPalette: inSide('Create custom palette', { sel: 'button' }),
      stylePreset: inSide('e\\.g\\. Smith Lab Green', { sel: 'input' }),
      headingStyle: inSide('^(None|Bottom|Left|Box|Thick)$', { sel: 'button' }),
      weight: inSide('300.*800', { sel: 'select' }),
      italic: inSide('^I$', { sel: 'button[aria-pressed]' }),
      lineHeight: inSide('Line height', { sel: 'input' }),
    },
    keep: { palettes: inSide('Classic Academic', { sel: 'button' }), font: inSide('Source Sans 3', { sel: 'select' }), sizes: inSide('Font size \\(points\\)', { sel: 'input' }) },
  },
  textBlock: {
    hide: {
      contentBox: { sel: `${SIDE} [contenteditable]` },
      fontSize: inSide('Font size \\(points\\)', { sel: 'input' }),
      weight: inSide('300.*800', { sel: 'select' }),
      italic: inSide('^Italic$', { sel: 'button' }),
      lineSpacing: { sel: `${SIDE} input[type="range"]` },
      textColour: { sel: `${SIDE} input[type="color"]` },
      resetPalette: inSide('Reset to palette', { sel: 'button' }),
      strike: t('^S$', { sel: 'button' }),
      indent: t('^(⇥|⇤)$', { sel: 'button' }),
      highlight: t('^(Highlight · .*|Clear highlight)$', { sel: 'button' }),
      colour: t('^(Text · .*|Default color)$', { sel: 'button' }),
    },
    keep: { bold: t('^B$', { sel: 'button' }), underline: t('^U$', { sel: 'button' }), bullets: t('^•$', { sel: 'button' }), numbered: t('^1\\.$', { sel: 'button' }), clear: t('^Clear( formatting)?', { sel: 'button' }) },
  },
  image: {
    hide: {
      crop: t('^(Crop image|Exit crop)$', { sel: 'button' }),
      rotate: t('^Drag to rotate', { sel: 'button' }),
      stretch: inSide('Stretch to fit block', { sel: 'label' }),
      captionPosition: inSide('^(Top|Bottom|Left|Right|Hide)$', { sel: 'button' }),
      captionSpacing: { sel: `${SIDE} input[type="range"]` },
      formatNote: inSide('Format note|Note formatted', { sel: 'button' }),
      cropHint: inSide('Click the ✂︎ button', { sel: 'div' }),
    },
    keep: { replace: t('^Replace image$', { sel: 'button' }), caption: inSide('figure description', { sel: 'input' }), note: { sel: `${SIDE} textarea` } },
  },
  figureTab: {
    hide: { scan: inSide('Scan image', { sel: 'button' }) },
    keep: { check: inSide('Check a figure', { sel: 'button' }) },
  },
  table: {
    hide: {
      borderStyle: inSide('^(None|APA 3-Line|All Lines|H-Lines|Header Box|Custom)$', { sel: 'button' }),
      formatTable: inSide('Format table|Table formatted', { sel: 'button' }),
      tipsForHidden: inSide('header strip|Drag column borders|Format table', { sel: 'li', dom: true }),
      rowStrips: { sel: '#poster-canvas [aria-label^="Select row"]' },
      colStrips: { sel: '#poster-canvas [aria-label^="Select column"]' },
      colResize: { sel: '#poster-canvas [title="Drag to resize column"]' },
    },
    keep: { rowsCols: inSide('^(Add row at bottom|Add column at right|Remove last row|Remove last column)', { sel: 'button' }), caption: inSide('table description', { sel: 'input' }) },
  },
  refs: {
    hide: { citationStyle: inSide('Vancouver', { sel: 'select' }) },
    keep: { importBib: inSide('Import \\.bib', { sel: 'button' }) },
  },
  export: {
    hide: { postrBackup: { sel: '[data-postr-export-postr]' }, staples: inSide('Email the PDF to Staples', { sel: 'button' }) },
    keep: { savePdf: inSide('Save PDF', { sel: 'button' }), pptx: { sel: '[data-postr-export-pptx]' } },
  },
  dashboard: {
    hide: { importCta: { sel: '[data-postr-import-cta]' }, importMenu: { sel: '[aria-label="More poster options"]' } },
    keep: { newPoster: t('\\+ New poster', { sel: 'button' }), cardDuplicate: { sel: '[aria-label^="Duplicate "]' } },
  },
};

async function probe(page, place, out) {
  const { hide, keep } = PLACES[place];
  const counts = await countProbes(page, { ...hide, ...keep });
  for (const k of Object.keys(hide)) out.hidden[`${place}.${k}`] = counts[k];
  for (const k of Object.keys(keep)) out.kept[`${place}.${k}`] = counts[k];
}

/** The table's canvas controls a pointer reaches: the hover "+" and the right-click menu. */
async function tablePointerControls(page, tableId) {
  const cell = page.locator(`#poster-canvas [data-block-id="${tableId}"] td`).last();
  await cell.hover();
  await page.waitForTimeout(250);
  const hover = await countProbes(page, { addRowCol: { sel: '#poster-canvas button[title="Add row"], #poster-canvas button[title="Add column"]' } });
  await cell.click({ button: 'right' });
  await page.waitForTimeout(300);
  const menu = await countProbes(page, { tableMenu: t('^(Insert row above|Insert column left|Delete row)$', { sel: 'button, div' }) });
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  return { addRowCol: hover.addRowCol, tableMenu: menu.tableMenu };
}

const editorInventory = {
  id: 'H1-editor-controls',
  how: '/p/new, every tab and selection a user meets: the hidden controls and the kept ones counted',
  async run(h, s) {
    const { page } = s;
    const out = { hidden: {}, kept: {} };
    await openTab(page, 'layout');
    await probe(page, 'layout', out);
    await openTab(page, 'style');
    await probe(page, 'style', out);
    // A text block with a word in it, the word selected: the Edit tab and the format bar.
    const text = (await promptStates(page)).find((x) => x.type === 'text');
    await focusBlockEnd(page, text.id);
    await page.keyboard.type(' ZQWORD', { delay: 30 });
    await selectLastWord(page, text.id);
    await page.waitForTimeout(400);
    await probe(page, 'textBlock', out);
    await deselect(page);
    const imageId = await page.evaluate(() => document.querySelector('#poster-canvas [data-block-type="image"]')?.getAttribute('data-block-id'));
    await selectFrame(page, imageId);
    await openTab(page, 'edit');
    await probe(page, 'image', out);
    await openTab(page, 'figure');
    await probe(page, 'figureTab', out);
    await deselect(page);
    const tableId = await page.evaluate(() => document.querySelector('#poster-canvas [data-block-type="table"]')?.getAttribute('data-block-id'));
    await selectFrame(page, tableId);
    await openTab(page, 'edit');
    await probe(page, 'table', out);
    await deselect(page);
    await openTab(page, 'references');
    await probe(page, 'refs', out);
    await openTab(page, 'export');
    await probe(page, 'export', out);
    // Last in the editor: WebKit's own right-click menu keeps the next
    // clicks (MEASURED: the tab clicks after it did not land).
    Object.assign(out.hidden, Object.fromEntries(Object.entries(await tablePointerControls(page, tableId)).map(([k, v]) => [`table.${k}`, v])));
    await page.goto(`${h.base}/dashboard`);
    await page.waitForSelector('text=My posters', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await probe(page, 'dashboard', out);
    const shown = Object.entries(out.hidden).filter(([, n]) => n > 0).map(([k]) => k);
    const missing = Object.entries(out.kept).filter(([, n]) => !n).map(([k]) => k);
    return {
      claims: { H1: shown.length > 0, K1: missing.length > 0 },
      numbers: { hiddenShown: `${shown.length} of ${Object.keys(out.hidden).length}`, shown: shown.join(',') || 'none', keptMissing: missing.join(',') || 'none', hidden: JSON.stringify(out.hidden), kept: JSON.stringify(out.kept) },
    };
  },
};

/** The first-visit tour, step by step: what it says. */
const tour = {
  id: 'H2-tour',
  how: 'the onboarding tour a first visit starts at /p/new, every step read through "Next"',
  session: { tour: true },
  async run(h, s) {
    const { page } = s;
    await page.waitForSelector('text=Skip tour', { timeout: 15000 });
    const steps = [];
    for (let i = 0; i < 14; i += 1) {
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => {
        const skip = [...document.querySelectorAll('button')].find((b) => /Skip tour/.test(b.textContent ?? ''));
        let box = skip;
        while (box && !/Next|Done/.test(box.textContent ?? '')) box = box.parentElement;
        return box ? box.parentElement.textContent : null;
      });
      if (!text) break;
      steps.push(text.replace(/\s+/g, ' ').slice(0, 400));
      const next = page.getByRole('button', { name: /^(Next →|Done)$/ });
      const label = await next.textContent();
      await next.click();
      if (/Done/.test(label ?? '')) break;
    }
    const says = (re) => steps.filter((x) => re.test(x)).length;
    return {
      claims: {
        H2i: says(/\.postr|Import it|Import…/) > 0,
        H2s: says(/Staples/) > 0,
        H2g: says(/guidelines|board sizes/i) > 0,
        H2c: says(/Vancouver|IEEE|Harvard/) > 0,
      },
      numbers: { steps: steps.length, titles: JSON.stringify(steps.map((x) => x.slice(0, 60))) },
    };
  },
};

/** The profile page's preferences that only hidden controls fill. */
const profile = {
  id: 'H3-profile',
  how: '/profile: the style presets row and the checklist templates row',
  async run(h, s) {
    const { page } = s;
    await page.goto(`${h.base}/profile`);
    await page.waitForSelector('text=Preferences', { timeout: 30000 });
    await page.waitForTimeout(800);
    const c = await countProbes(page, { presets: t('^🎨 Saved style presets$', { sel: 'div' }), checklists: t('^Checklist templates$', { sel: 'div' }), tourRow: t('^Onboarding tour$', { sel: 'div' }) });
    return { claims: { H3p: c.presets > 0, H3c: c.checklists > 0, K3: c.tourRow === 0 }, numbers: c };
  },
};

const RED = 'rgb(239, 68, 68)';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQI12P4z8DAwMDAwMDAwMDAAAA9AAH/0x0QJAAAAABJRU5ErkJggg==';

/** A poster stored with every adjustment the switches hide, and the values the hidden controls stay at. */
function adjustedDoc() {
  const base = { imageSrc: null, imageFit: 'contain', tableData: null };
  return {
    ...DEFAULT_DATA,
    styles: { ...DEFAULT_DATA.styles, body: { ...DEFAULT_DATA.styles.body, weight: 300, lineHeight: 2 } },
    headingStyle: { border: 'box', fill: false, align: 'left' },
    blocks: [
      { ...base, id: 'adj-title', type: 'title', x: 10, y: 10, w: 460, h: 45, content: 'ZQ Adjusted poster' },
      { ...base, id: 'adj-h', type: 'heading', x: 10, y: 80, w: 145, h: 20, content: 'ZQHEAD' },
      { ...base, id: 'adj-rot', type: 'text', x: 10, y: 110, w: 145, h: 60, content: 'ZQROT turned text', rotation: 15 },
      { ...base, id: 'adj-red', type: 'text', x: 165, y: 110, w: 145, h: 60, content: `ZQBODY <span style="color: ${RED}">ZQRED</span>` },
      { ...base, id: 'adj-img', type: 'image', x: 320, y: 80, w: 145, h: 100, imageSrc: PIXEL, imageFit: 'fill', crop: { top: 10, right: 5, bottom: 0, left: 0 }, caption: 'ZQBOTTOM', captionPosition: 'bottom' },
      { ...base, id: 'adj-img2', type: 'image', x: 320, y: 200, w: 145, h: 100, imageSrc: PIXEL, caption: 'ZQTOPCAP' },
      { ...base, id: 'adj-tab', type: 'table', x: 165, y: 200, w: 145, h: 60, tableData: { rows: 3, cols: 3, cells: ['A', 'B', 'C', '1', '2', '3', '4', '5', '6'], colWidths: null, borderPreset: 'all' } },
      { ...base, id: 'adj-refs', type: 'references', x: 10, y: 200, w: 145, h: 80 },
    ],
    references: [{ id: 'r1', authors: ['Doe, Jane'], year: '2020', title: 'ZQ sample study', journal: 'Sample Journal' }],
    authors: [{ id: 'a1', name: 'Jane Doe', affiliationIds: [] }],
  };
}

const storedDraw = {
  id: 'D1-stored-adjustments',
  how: 'a poster stored with a 15° rotation, a crop, a stretched image, All Lines borders, a red word, body weight 300 and line height 2, boxed headings: drawn as stored; an image with no stored caption position, a typed reference, Insert › Table',
  async run(h, s) {
    const { page } = s;
    const id = await openStoredPoster(h, s, adjustedDoc());
    await deselect(page);
    const m = await page.evaluate((red) => {
      const blk = (i) => document.querySelector(`#poster-canvas [data-block-id="${i}"]`);
      const img = blk('adj-img')?.querySelector('img');
      const bodyCe = blk('adj-red')?.querySelector('[contenteditable]');
      const bodyCs = bodyCe ? getComputedStyle(bodyCe) : null;
      const span = [...(bodyCe?.querySelectorAll('span') ?? [])].find((x) => x.textContent.includes('ZQRED'));
      const headCs = (() => { const ce = blk('adj-h')?.querySelector('[contenteditable]'); return ce ? getComputedStyle(ce.parentElement) : null; })();
      const cells = [...(blk('adj-tab')?.querySelectorAll('td') ?? [])];
      const lined = cells.filter((td) => ['Top', 'Right', 'Bottom', 'Left'].some((side) => getComputedStyle(td)[`border${side}Style`] !== 'none')).length;
      const pos = (blockId, word) => {
        const b = blk(blockId);
        const cap = [...(b?.querySelectorAll('*') ?? [])].find((e) => e.children.length === 0 && e.textContent.includes(word));
        const im = b?.querySelector('img');
        return cap && im ? Math.round(cap.getBoundingClientRect().top - im.getBoundingClientRect().top) : null;
      };
      const refs = blk('adj-refs')?.textContent ?? '';
      return {
        rotation: blk('adj-rot')?.style.transform ?? '',
        clip: img ? getComputedStyle(img).clipPath : null,
        fit: img ? getComputedStyle(img).objectFit : null,
        weight: bodyCs?.fontWeight ?? null,
        lineRatio: bodyCs ? Math.round((parseFloat(bodyCs.lineHeight) / parseFloat(bodyCs.fontSize)) * 100) / 100 : null,
        red: span ? getComputedStyle(span).color === red : false,
        headingBox: headCs ? ['Top', 'Right', 'Bottom', 'Left'].every((side) => headCs[`border${side}Style`] !== 'none') : null,
        linedCells: `${lined} of ${cells.length}`,
        bottomCaptionBelow: pos('adj-img', 'ZQBOTTOM'),
        defaultCaptionAbove: pos('adj-img2', 'ZQTOPCAP'),
        refsText: refs.slice(0, 120),
      };
    }, RED);
    await openTab(page, 'insert');
    await page.locator('[data-postr-sidebar] button').filter({ hasText: /^\+ Table/ }).first().click();
    await page.waitForTimeout(1500);
    const tables = (rowOf(s.state, id)?.data?.blocks ?? []).filter((b) => b.type === 'table' && b.id !== 'adj-tab');
    const newPreset = tables[tables.length - 1]?.tableData?.borderPreset ?? null;
    return {
      claims: {
        D1r: !/rotate\(15deg\)/.test(m.rotation),
        D1c: !/inset/.test(m.clip ?? ''),
        D1f: m.fit !== 'fill',
        D1w: m.weight !== '300' || m.lineRatio !== 2,
        D1k: !m.red,
        D1h: !m.headingBox,
        D1b: !(parseInt(m.linedCells, 10) > 3),
        D1p: !(m.bottomCaptionBelow > 0),
        V1: !(m.defaultCaptionAbove < 0),
        V2: newPreset !== 'apa',
        V3: !/Doe, J\. \(2020\)\. ZQ sample study\./.test(m.refsText) || /^\s*\[?1[.\]]/.test(m.refsText),
      },
      numbers: { ...m, newTablePreset: newPreset },
    };
  },
};

export const HIDDEN = [editorInventory, tour, profile, storedDraw];
