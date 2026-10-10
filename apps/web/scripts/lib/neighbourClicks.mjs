/**
 * Scenarios of scripts/control-size-check.mjs for fix 19's review finding F3
 * (record 19, section 9): zoomed far out, one-size controls are wider than
 * the blocks they belong to, and a click meant for another block reaches
 * them. Folds in the reviewer's probes `floorclick.mjs` (a click at each
 * other block's centre, the template's image selected, at the floor and a
 * pinch to 0.35) and `neighbours.mjs` (which other blocks lie under the
 * selection's controls), as docs/fixes/README.md asks of a probe that found
 * a defect. Run through lib/controlReview.mjs's lists.
 *
 * CLAIMS (OBSERVED when the defect is present)
 *   Fd   a click at another block's centre changes the selected block: it
 *        deletes it, opens the file picker or a dialog (Replace), turns crop
 *        mode on (Crop), or moves, resizes or turns it (by more than 0.5
 *        sheet units or 0.01 degrees). The template's image (with a picture),
 *        its title and its table selected in turn, at the 20% floor and a
 *        pinch to 0.35, 1280 x 800, the 48 x 36 in poster; every other block
 *        clicked once, the subject selected again before each click (a click
 *        on the workspace, then on a point of its own). Must be 0.
 *   Fh   the pointer at another block's centre is over a selected block's
 *        Delete, Replace or Crop button (the hovered element, no click):
 *        every block of the template selected in turn, at the floor, 0.35
 *        and the fit. The sweep for F3's siblings beyond Fd's three
 *        subjects. Must be 0.
 *   Ns   INFORMATION: of Fd's clicks, those that leave the clicked block not
 *        selected (what is on top at its centre is a control of the selected
 *        block: a handle, the move button, the rotate control, a table's
 *        strip, the handle row between its buttons).
 *   Fr   at the views a user edits at (the 1280 x 800 fit, 100% there, the
 *        2560 x 1440 fit), a 3 in image and a 3 x 2 in logo (narrower on
 *        screen than their 108 px row) do not draw Replace, Crop, Delete or
 *        the rotate control: the row rule must cut a row only zoomed out (the
 *        lead, 2026-10-06). Must be 0. While record 29's ADJUSTMENTS_ENABLED
 *        is off (config/features.ts) Crop and the rotate control are hidden
 *        and not asked for: Replace and Delete are (since the merge of main,
 *        record 30, into record 29).
 *   Fz   INFORMATION, on demand (`--only overview-...`): Fd's clicks and Fh's
 *        sweep at zooms 0.2 to 1, served with the row rule taken away (the
 *        spec's `row-never-collapses`): from which zoom a whole row no
 *        longer puts a destructive button on another block's centre. It set
 *        the overview threshold (record 19, section 9).
 * CONTROLS (a failure is exit 2)
 *   K-fd  before each click, the subject (and only it) is selected and the
 *         zoom is the step's (the floor 0.2, the pinch 0.35 within 0.5%);
 *         before each hit test the same, at the fit too
 * BLIND SPOTS: one poster and one template; a block's centre only (the
 *   reviewer's `neighbours.mjs` sampled a grid; Nb, Fd and Fh read the
 *   centre); what the pointer is over is read once it has moved there (60
 *   ms; a click is the pointer pressed and released there); a click without a drag (a drag on a handle or the move button
 *   moves the block on purpose); the logo's Replace (LogoPicker) is read as
 *   any dialog, and no logo is a subject.
 */
import { openEditor, switchesOff } from './editorHarness.mjs';
import { centreSelection, clickOwnPoint, pinchTo, round, stepUntilStable, zoomNow } from './selectionControls.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';
const VIEW = { width: 1280, height: 800 };
const POSTER = { w: 48, h: 36 };
/** The controls whose click changes the block: Delete, Replace, Crop. */
const DESTRUCTIVE = '^(Delete block|Replace image|Replace logo|Crop image|Exit crop)';
/** The pop on selection (blockSelection, 280 ms) scales the block's ring: wait it out. */
const SETTLE_MS = 120;

/** The template, its image with a picture (an empty one opens the file picker on click), its blocks with fixed ids. */
const neighbourDoc = (doc) => ({
  ...doc,
  blocks: doc.blocks.map((b, i) => ({ ...b, id: `zqn${i}`, ...(b.type === 'image' ? { imageSrc: PNG } : {}) })),
});

/** Open the editor at the fit, then at `z` ('floor', 'fit', or a zoom such as '0.35'). */
async function openAt(h, z) {
  const session = await openEditor(h, { viewport: VIEW, poster: POSTER, editDoc: neighbourDoc });
  session.choosers = 0;
  session.page.on('filechooser', () => { session.choosers += 1; });
  await zoomTo(session.page, z);
  return session;
}

async function zoomTo(page, z) {
  await page.getByRole('button', { name: 'Fit poster to screen' }).click();
  await page.waitForTimeout(350);
  if (z === 'floor') await stepUntilStable(page, 'Zoom out', 60);
  else if (z !== 'fit') await pinchTo(page, Number(z));
}

const zoomOk = (z, zoom, fit) => (z === 'floor' ? Math.abs(zoom - 0.2) < 1e-6 : z === 'fit' ? Math.abs(zoom - fit) < 1e-6 : Math.abs(zoom / Number(z) - 1) < 0.005);

/** Nothing selected (a click on the workspace, clear of the sheet), then the subject by a point of its own. */
async function selectOnly(page, id) {
  const o = await page.locator('[data-postr-canvas-outer]').boundingBox();
  await page.mouse.click(o.x + 12, o.y + 12);
  await page.waitForTimeout(150);
  await clickOwnPoint(page, `[data-block-id="${id}"]`);
  await page.waitForTimeout(SETTLE_MS);
}

/** The subject's stored geometry as rendered, whether crop mode is on, what is selected, and the zoom. */
const stateOf = (page, id) => page.evaluate((id) => {
  const sheet = document.getElementById('poster-canvas');
  const el = sheet.querySelector(`:scope > [data-block-id="${id}"]`);
  const n = (v) => Number(String(v).replace('px', ''));
  return {
    geom: el ? { x: n(el.style.left), y: n(el.style.top), w: n(el.style.width), h: n(el.style.height), turn: Number((el.style.transform.match(/rotate\(([-\d.e]+)deg\)/) ?? [0, 0])[1]) } : null,
    crop: !!el && !!el.querySelector('[aria-label="crop top edge"]'),
    dialog: !!document.querySelector('[role="dialog"]'),
    selected: [...sheet.querySelectorAll(':scope > [data-postr-selected="true"]')].map((e) => e.dataset.blockId),
    zoom: sheet.getBoundingClientRect().width / n(sheet.style.width),
  };
}, id);

/**
 * The pointer moved to a block's centre, as a user aims, and what it is over
 * there (the deepest hovered element, the one a click reaches: Firefox
 * delivers the pointer at whole pixels, so a hit test at the exact centre
 * can name the element next to it): the block itself, or a control of the
 * selected block (named).
 */
async function aimAt(page, id) {
  const c = await page.evaluate((id) => {
    const r = document.querySelector(`#poster-canvas > [data-block-id="${id}"]`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
  await page.mouse.move(c.x, c.y);
  await page.waitForTimeout(60);
  return { ...c, ...(await overOf(page, id, DESTRUCTIVE)) };
}

const overOf = (page, id, destructive) => page.evaluate(({ id, destructive }) => {
  const sheet = document.getElementById('poster-canvas');
  const b = sheet.querySelector(`:scope > [data-block-id="${id}"]`);
  const sel = sheet.querySelector(':scope > [data-postr-selected="true"]');
  const top = [...document.querySelectorAll(':hover')].pop() ?? null;
  let onTop = top && b.contains(top) ? 'itself' : top ? top.tagName.toLowerCase() : 'nothing';
  let harmful = false;
  if (top && sel && sel.contains(top)) {
    const t = top.closest('[title], [aria-label]');
    const name = t && sel.contains(t) ? (t.getAttribute('title') || t.getAttribute('aria-label')) : null;
    onTop = top.closest('[data-postr-resize-handle]') ? 'a resize handle' : name ? name.split(' (')[0].split(' —')[0] : 'the handle row';
    harmful = !!name && new RegExp(destructive).test(name);
  }
  return { type: b.dataset.blockType, onTop, harmful };
}, { id, destructive });

/** What a click did to the subject (null: nothing). */
function harmOf(before, after, choosers) {
  if (!after.geom) return 'the block was deleted';
  if (choosers) return 'the file picker opened (Replace)';
  if (after.dialog && !before.dialog) return 'a dialog opened';
  if (after.crop && !before.crop) return 'crop mode opened (Crop)';
  const moved = Math.max(...['x', 'y', 'w', 'h'].map((k) => Math.abs(after.geom[k] - before.geom[k])));
  if (moved > 0.5) return `the block moved or resized by ${round(moved)} units`;
  if (Math.abs(after.geom.turn - before.geom.turn) > 0.01) return `the block turned by ${round(after.geom.turn - before.geom.turn)}°`;
  return null;
}

/**
 * Claims Fd and Ns: `pick` finds the subject's id in the page. With `zooms`
 * given, the on-demand overview measurement instead (Fz, below).
 */
function clickScenario(name, pick, zooms = null) {
  const steps = zooms ?? ['floor', '0.35'];
  return {
    id: zooms ? `overview-clicks-1280x800-48x36-${name}` : `floorclick-1280x800-48x36-${name}`,
    onDemand: !!zooms,
    async run(h) {
      const clicks = [];
      const k = [];
      let s = null;
      try {
        for (const z of steps) {
          s = await openAt(h, z);
          const subject = await s.page.evaluate(pick);
          const ids = await s.page.evaluate(() => [...document.querySelectorAll('#poster-canvas > [data-block-id]')].map((e) => e.dataset.blockId));
          for (const target of ids.filter((i) => i !== subject)) {
            await selectOnly(s.page, subject);
            const before = await stateOf(s.page, subject);
            if (before.selected.join() !== subject || !zoomOk(z, before.zoom)) {
              k.push(`${name} at ${z}, before ${target}: selected ${before.selected.join(',') || 'nothing'}, zoom ${round(before.zoom, 4)}`);
              continue;
            }
            const at = await aimAt(s.page, target);
            const choosers = s.choosers;
            await s.page.mouse.down();
            await s.page.mouse.up();
            await s.page.waitForTimeout(300);
            const after = await stateOf(s.page, subject);
            const harm = harmOf(before, after, s.choosers - choosers);
            clicks.push({ z, zoom: round(before.zoom, 4), target: at.type, onTop: at.onTop, selected: after.selected.includes(target), harm });
            if (!after.geom) {
              await s.context.close();
              s = await openAt(h, z);
            }
          }
          if (s.state.errors.length) throw new Error(`page errors: ${s.state.errors.join(' | ').slice(0, 200)}`);
          await s.context.close();
          s = null;
        }
      } finally {
        if (s) await s.context.close();
      }
      const bad = clicks.filter((c) => c.harm);
      const line = `[${bad.length ? `OBSERVED ${zooms ? 'Fz' : 'Fd'}` : 'not observed'}] ${this.id} ${steps.map((z) => {
        const at = clicks.filter((c) => c.z === z);
        return `${z}: ${at.filter((c) => c.harm).length} harmful, ${at.filter((c) => !c.selected).length} of ${at.length} not selected${at.some((c) => c.harm || !c.selected) ? ` (${at.filter((c) => c.harm || !c.selected).map((c) => `${c.target} under ${c.onTop}${c.harm ? ` → ${c.harm}` : ''}`).join('; ')})` : ''}`;
      }).join(' · ')}`;
      return { [zooms ? 'overviewClicks' : 'floorClicks']: { subject: name, clicks, k }, line };
    },
  };
}

/**
 * Claim Fh: every block selected in turn; the other blocks whose centre is
 * under its Delete, Replace or Crop button. With `zooms` given, the
 * on-demand overview measurement instead (Fz, below).
 */
const sweepScenario = (zooms = null) => ({
  id: zooms ? 'overview-sweep-1280x800-48x36' : 'destructive-sweep-1280x800-48x36',
  onDemand: !!zooms,
  async run(h) {
    const s = await openAt(h, 'fit');
    try {
      const fit = await zoomNow(s.page);
      const ids = await s.page.evaluate(() => [...document.querySelectorAll('#poster-canvas > [data-block-id]')].map((e) => e.dataset.blockId));
      const steps = [];
      const k = [];
      for (const z of zooms ?? ['floor', '0.35', 'fit']) {
        await zoomTo(s.page, z);
        for (const subject of ids) {
          await selectOnly(s.page, subject);
          const st = await stateOf(s.page, subject);
          if (st.selected.join() !== subject || !zoomOk(z, st.zoom, fit)) {
            k.push(`subject ${subject} at ${z}: selected ${st.selected.join(',') || 'nothing'}, zoom ${round(st.zoom, 4)}`);
            continue;
          }
          const type = await s.page.evaluate((id) => document.querySelector(`#poster-canvas > [data-block-id="${id}"]`).dataset.blockType, subject);
          const under = [];
          for (const other of ids.filter((i) => i !== subject)) {
            const at = await aimAt(s.page, other);
            if (at.harmful) under.push(`${at.type} under ${at.onTop}`);
          }
          steps.push({ z, zoom: round(st.zoom, 4), subject: `${type} ${subject}`, under });
        }
      }
      if (s.state.errors.length) throw new Error(`page errors: ${s.state.errors.join(' | ').slice(0, 200)}`);
      const bad = steps.filter((x) => x.under.length);
      const line = `[${bad.length ? `OBSERVED ${zooms ? 'Fz' : 'Fh'}` : 'not observed'}] ${this.id} ${(zooms ?? ['floor', '0.35', 'fit']).map((z) => `${z}: ${bad.filter((x) => x.z === z).length} of ${steps.filter((x) => x.z === z).length} subjects`).join(' · ')}${bad.length ? ` (${bad.map((x) => `${x.subject} at ${x.z}: ${x.under.join(', ')}`).join('; ')})` : ''}`;
      return { [zooms ? 'overviewSweep' : 'destructiveSweep']: { steps, k }, line };
    } finally {
      await s.context.close();
    }
  },
});

/** A 3 in image at the sheet's left edge and a 3 × 2 in logo at its right edge, mid-height (Fr). */
const smallDoc = (doc) => {
  const base = { content: '', imageSrc: PNG, imageFit: 'contain', tableData: null };
  return {
    ...doc,
    blocks: [...doc.blocks,
      { ...base, id: 'zqfrimage', type: 'image', x: 0, y: doc.heightIn * 10 * 0.55, w: 30, h: 30 },
      { ...base, id: 'zqfrlogo', type: 'logo', x: doc.widthIn * 10 - 30, y: doc.heightIn * 10 * 0.55, w: 30, h: 20 }],
  };
};

/** The selected block's row buttons and rotate control, and its width on screen inside its border; `adjustments` false leaves out Crop and rotate (record 29 hides them). */
const rowOf = (page, id, adjustments = switchesOff('ADJUSTMENTS_ENABLED').length === 0) => page.evaluate(({ id, adjustments }) => {
  const sheet = document.getElementById('poster-canvas');
  const el = sheet.querySelector(`:scope > [data-block-id="${id}"]`);
  // Main draws its rotate button as a child of the block, itself marked.
  const titles = [...el.querySelectorAll('[data-postr-selection-ui] button, button[data-postr-selection-ui]')].map((b) => b.getAttribute('title') || '');
  const has = (re) => titles.some((t) => re.test(t));
  const zoom = sheet.getBoundingClientRect().width / Number(sheet.style.width.replace('px', ''));
  return {
    selected: [...sheet.querySelectorAll(':scope > [data-postr-selected="true"]')].map((e) => e.dataset.blockId),
    zoom, wPx: el.clientWidth * zoom,
    missing: [['Replace', /^Replace /], ...(adjustments ? [['Crop', /^(Crop image|Exit crop)/]] : []), ['Delete', /^Delete block/], ...(adjustments ? [['rotate', /^Drag to rotate/]] : [])].filter(([, re]) => !has(re)).map(([n]) => n),
  };
}, { id, adjustments });

/** Claim Fr: at the views a user edits at, a 3 in image and a 3 × 2 in logo keep Replace, Crop, Delete and the rotate control. */
function rowScenario(vw, vh, views) {
  return {
    id: `small-row-${vw}x${vh}-48x36`,
    async run(h) {
      const { context, page, state } = await openEditor(h, { viewport: { width: vw, height: vh }, poster: POSTER, editDoc: smallDoc });
      try {
        const steps = [];
        for (const id of ['zqfrimage', 'zqfrlogo']) {
          for (const v of views) {
            await page.getByRole('button', { name: 'Fit poster to screen' }).click();
            await page.waitForTimeout(350);
            const fit = await zoomNow(page);
            await selectOnly(page, id);
            if (v === '100') { await pinchTo(page, 1); await centreSelection(page); }
            const r = await rowOf(page, id);
            const zoomRight = v === 'fit' ? Math.abs(r.zoom - fit) < 1e-6 : Math.abs(r.zoom - 1) < 0.005;
            steps.push({ id, v, zoom: round(r.zoom, 4), wPx: round(r.wPx, 1), missing: r.missing, ok: r.selected.join() === id && zoomRight });
          }
        }
        if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
        const bad = steps.filter((x) => x.missing.length);
        const line = `[${bad.length ? 'OBSERVED Fr' : 'not observed'}] ${this.id} ${steps.map((x) => `${x.id.slice(4)} at ${x.v} (${x.zoom}, ${x.wPx} px)${x.missing.length ? `: no ${x.missing.join(', ')}` : ''}`).join(' · ')}`;
        return { smallRow: steps, line };
      } finally {
        await context.close();
      }
    },
  };
}

/**
 * The zooms of the overview measurement (on demand, `--only`): where a full
 * handle row stops reaching other blocks' controls-free centres. Served with
 * the row rule taken away (the spec's `row-never-collapses`), it picked the
 * overview threshold (record 19, section 9).
 */
const OVERVIEW_ZOOMS = ['0.2', '0.25', '0.3', '0.35', '0.4', '0.5', '0.6', '0.75', '1'];
const PICK = {
  image: () => document.querySelector('#poster-canvas > [data-block-type="image"]').dataset.blockId,
  title: () => document.querySelector('#poster-canvas > [data-block-type="title"]').dataset.blockId,
  table: () => document.querySelector('#poster-canvas > [data-block-type="table"]').dataset.blockId,
};

/** The scenarios, for lib/controlReview.mjs's list (the overview ones run only when named). */
export function neighbourClickScenarios() {
  return [
    ...Object.entries(PICK).map(([n, pick]) => clickScenario(n, pick)),
    sweepScenario(),
    rowScenario(1280, 800, ['fit', '100']),
    rowScenario(2560, 1440, ['fit']),
    ...Object.entries(PICK).map(([n, pick]) => clickScenario(n, pick, OVERVIEW_ZOOMS)),
    sweepScenario(OVERVIEW_ZOOMS),
  ];
}

/** Claims Fd, Fh and Ns and control K-fd, from the harness's results. */
export function neighbourClickVerdicts(results) {
  const claim = () => ({ observed: 0, of: 0, cases: [] });
  const claims = { Fd: claim(), Fh: claim(), Ns: claim(), Fr: claim() };
  const controls = { 'K-fd': [] };
  for (const r of results.filter((x) => x.smallRow)) {
    for (const x of r.smallRow) {
      if (!x.ok) controls['K-fd'].push(`${r.id} ${x.id} at ${x.v}: not selected or zoom ${x.zoom}`);
      claims.Fr.of += 1;
      if (x.missing.length) { claims.Fr.observed += 1; claims.Fr.cases.push(`${r.id} ${x.id} at ${x.v} (${x.zoom}, ${x.wPx} px): no ${x.missing.join(', ')}`); }
    }
  }
  for (const r of results.filter((x) => x.floorClicks)) {
    const { subject, clicks, k } = r.floorClicks;
    controls['K-fd'].push(...k);
    if (!clicks.some((c) => c.z === 'floor') || !clicks.some((c) => c.z === '0.35')) controls['K-fd'].push(`${r.id}: no clicks at a step`);
    for (const c of clicks) {
      claims.Fd.of += 1;
      claims.Ns.of += 1;
      if (c.harm) { claims.Fd.observed += 1; claims.Fd.cases.push(`${subject} at ${c.z} (${c.zoom}): ${c.target} under ${c.onTop} → ${c.harm}`); }
      if (!c.selected) { claims.Ns.observed += 1; claims.Ns.cases.push(`${subject} at ${c.z} (${c.zoom}): ${c.target} under ${c.onTop}`); }
    }
  }
  for (const r of results.filter((x) => x.destructiveSweep)) {
    const { steps, k } = r.destructiveSweep;
    controls['K-fd'].push(...k);
    for (const x of steps) {
      claims.Fh.of += 1;
      if (x.under.length) { claims.Fh.observed += 1; claims.Fh.cases.push(`${x.subject} at ${x.z} (${x.zoom}): ${x.under.join('; ')}`); }
    }
  }
  // Fz (information, on demand): per zoom, harmful clicks (Fd's test) and
  // subjects with a destructive button over another block's centre (Fh's).
  const fz = {};
  for (const r of results.filter((x) => x.overviewClicks)) {
    controls['K-fd'].push(...r.overviewClicks.k);
    for (const c of r.overviewClicks.clicks) {
      const z = (fz[c.z] ??= { clicks: 0, harmful: 0, sweep: 0, sweepHarmful: 0, cases: [] });
      z.clicks += 1;
      if (c.harm) { z.harmful += 1; z.cases.push(`${r.overviewClicks.subject}: ${c.target} under ${c.onTop} → ${c.harm}`); }
    }
  }
  for (const r of results.filter((x) => x.overviewSweep)) {
    controls['K-fd'].push(...r.overviewSweep.k);
    for (const x of r.overviewSweep.steps) {
      const z = (fz[x.z] ??= { clicks: 0, harmful: 0, sweep: 0, sweepHarmful: 0, cases: [] });
      z.sweep += 1;
      if (x.under.length) { z.sweepHarmful += 1; z.cases.push(`${x.subject} (hover): ${x.under.join('; ')}`); }
    }
  }
  if (Object.keys(fz).length) {
    claims.Fz = {
      observed: Object.values(fz).filter((z) => z.harmful || z.sweepHarmful).length, of: Object.keys(fz).length,
      cases: Object.entries(fz).map(([z, v]) => `zoom ${z}: ${v.harmful} of ${v.clicks} clicks harmful, ${v.sweepHarmful} of ${v.sweep} subjects with a destructive button over another block${v.cases.length ? ` (${v.cases.join('; ')})` : ''}`),
    };
  }
  return { claims, controls };
}
