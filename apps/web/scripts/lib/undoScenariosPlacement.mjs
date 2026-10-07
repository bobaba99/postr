/**
 * Scenarios for scripts/undo-history-check.mjs from fix 12's merge with main
 * (record docs/fixes/12-one-undo-history.md, section 11; the merge review's
 * F2, folded in from the integrator's probe history-vs-controls.mjs and the
 * reviewer's overlap.mjs): owner decision 5 put the Undo and Redo buttons
 * "in the editor's top bar". They floated over the workspace's top gutter,
 * where a selected block's handle row is drawn for a block at the top of the
 * sheet, and covered a top-left block's move button at the fit on some
 * poster shapes (8 of 624 selections in each engine). Each returns
 * { claims: {id: observed}, numbers }; a claim is OBSERVED when the defect is
 * present. The claims are listed in the harness header. `openWith` opens
 * the editor with another window, poster size or document.
 */
import { MOD, canonical, sleep } from './undoKit.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';
const logo = (id, x, rotation = 0) => ({ id, type: 'logo', x, y: 0, w: 30, h: 30, rotation, content: '', imageSrc: PNG, imageFit: 'contain', tableData: null });
/** Logos in the sheet's top-left corner, one turned 180° (its rotate control goes above it). */
const withCornerLogos = (doc) => {
  const d = canonical(doc);
  return { ...d, blocks: [...d.blocks, logo('zqtl', 0), logo('zqtl180', 40, 180)] };
};

/**
 * The History group against the workspace and the selected block's
 * controls: the area (px²) the group's box shares with the workspace's
 * visible box, and each control whose centre, inside the workspace, has the
 * group on top.
 */
const readPlacement = (page) => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const meet = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const group = document.querySelector('[data-postr-history-buttons]');
  const outer = document.querySelector('[data-postr-canvas-outer]');
  if (!group || !outer) return { error: `missing: ${group ? '' : 'History group '}${outer ? '' : 'workspace'}` };
  const ws = { x: outer.getBoundingClientRect().left, y: outer.getBoundingClientRect().top, w: outer.clientWidth, h: outer.clientHeight };
  const g = box(group);
  const block = document.querySelector('#poster-canvas [data-block-id][data-postr-selected="true"]');
  const under = [];
  if (block) {
    for (const c of block.querySelectorAll('button, [data-postr-resize-handle], [role="button"]')) {
      const r = c.getBoundingClientRect();
      if (!r.width || c.closest('[data-postr-ce]')) continue;
      const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
      if (cx < ws.x || cx > ws.x + ws.w || cy < ws.y || cy > ws.y + ws.h) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && group.contains(top)) under.push(c.getAttribute('title') || c.getAttribute('aria-label') || `handle-${c.getAttribute('data-postr-resize-handle')}`);
    }
  }
  return { group: [g.x, g.y, g.w, g.h].map(Math.round), workspaceTop: Math.round(ws.y), overWorkspacePx2: Math.round(meet(g, ws)), under };
});

const zoomNow = (page) => page.evaluate(() => {
  const s = document.getElementById('poster-canvas');
  return Math.round((s.getBoundingClientRect().width / parseFloat(s.style.width)) * 1000) / 1000;
});

async function hideSidebar(page) {
  await page.keyboard.press(`${MOD}+/`);
  await sleep(450);
}

async function fit(page) {
  await page.getByRole('button', { name: 'Fit poster to screen' }).click();
  await sleep(400);
}

/** Select block `id` with a click at its centre (clipped to the workspace); whether it is selected. */
async function select(page, id) {
  const b = await page.locator(`#poster-canvas [data-block-id="${id}"]`).first().boundingBox();
  const o = await page.locator('[data-postr-canvas-outer]').boundingBox();
  if (!b || !o) return false;
  const x = Math.min(Math.max(b.x + b.width / 2, o.x + 4), o.x + o.width - 4);
  const y = Math.min(Math.max(b.y + b.height / 2, o.y + 4), o.y + o.height - 4);
  await page.mouse.click(x, y);
  await sleep(250);
  return page.evaluate((id) => document.querySelector(`#poster-canvas [data-block-id="${id}"]`)?.getAttribute('data-postr-selected') === 'true', id);
}

/** The merge review's selections that had a control under the group (each engine), and the default poster. */
const CASES = [
  { view: [1280, 800], poster: [48, 48], sidebar: 'open' },
  { view: [1280, 800], poster: [44, 48], sidebar: 'open' },
  { view: [1280, 800], poster: [46, 48], sidebar: 'open' },
  { view: [1280, 800], poster: [48, 28], sidebar: 'hidden' },
  { view: [1280, 800], poster: [48, 30], sidebar: 'hidden' },
  { view: [1280, 800], poster: [48, 32], sidebar: 'hidden' },
  { view: [2560, 1440], poster: [48, 30], sidebar: 'hidden' },
  { view: [1280, 800], poster: [48, 36], sidebar: 'hidden', zoom: 'ceiling' },
  { view: [1280, 800], poster: [48, 36], sidebar: 'open' },
  { view: [1280, 800], poster: [48, 36], sidebar: 'hidden' },
];

/**
 * The top bar (or, on a tree without one, the group) at a window width:
 * nothing of it clipped or scrolled, the group inside the window, each
 * button its own top element at its centre (the phone notice, a strip at the
 * bottom below 640 px, not over it).
 */
const readFit = (page) => page.evaluate(() => {
  const group = document.querySelector('[data-postr-history-buttons]');
  if (!group) return { error: 'no History group' };
  const bar = document.querySelector('[data-postr-editor-topbar]');
  const g = group.getBoundingClientRect();
  const inWindow = g.left >= 0 && g.top >= 0 && g.right <= innerWidth && g.bottom <= innerHeight;
  const hits = [...group.querySelectorAll('button')].map((btn) => {
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top?.closest('button') === btn;
  });
  // The phone notice (MobileNotice: a fixed strip at the bottom below 640 px).
  const notice = document.querySelector('aside[role="region"][aria-label^="The editor is not optimised"]')?.getBoundingClientRect() ?? null;
  const noticeMeets = !!notice && notice.top < g.bottom && notice.bottom > g.top && notice.left < g.right && notice.right > g.left;
  const reveal = document.querySelector('[data-postr-sidebar-reveal]')?.getBoundingClientRect();
  // The sidebar's Show button, when it is hidden: drawn over the workspace
  // too, it would be the same trap as the group (the workspace's visible box).
  const outer = document.querySelector('[data-postr-canvas-outer]');
  const o = outer ? { l: outer.getBoundingClientRect().left, t: outer.getBoundingClientRect().top, w: outer.clientWidth, h: outer.clientHeight } : null;
  const revealOverWorkspace = reveal && o
    ? Math.round(Math.max(0, Math.min(reveal.right, o.l + o.w) - Math.max(reveal.left, o.l)) * Math.max(0, Math.min(reveal.bottom, o.t + o.h) - Math.max(reveal.top, o.t)))
    : 0;
  return {
    bar: bar ? { w: bar.clientWidth, scrollW: bar.scrollWidth, h: bar.getBoundingClientRect().height } : null,
    group: [g.left, g.top, g.width, g.height].map(Math.round),
    inWindow, hits, notice: notice ? `top ${Math.round(notice.top)}` : 'none', noticeMeets,
    reveal: reveal ? [reveal.left, reveal.top, reveal.width, reveal.height].map(Math.round) : null, revealOverWorkspace,
  };
});

export const PLACEMENT = [
  {
    id: 'B4-history-over-the-controls', claims: ['B4'],
    how: 'at the fit (and once at the ceiling, scrolled to the corner) for the shapes and windows where the merge review found a control under the group, and the default poster: logos in the sheet\'s top-left corner (one turned 180°) selected with a click; the History group\'s box against the workspace, and every control of the selection with the group on top at its centre',
    async run(page, ids, reopen, openWith) {
      const numbers = {};
      let observed = false;
      for (const c of CASES) {
        const label = `${c.view.join('x')} ${c.poster.join('x')} ${c.sidebar}${c.zoom ? ` ${c.zoom}` : ''}`;
        const { context, page: p } = await openWith({ viewport: { width: c.view[0], height: c.view[1] }, poster: { w: c.poster[0], h: c.poster[1] }, editDoc: withCornerLogos });
        try {
          if (c.sidebar === 'hidden') await hideSidebar(p);
          if (c.zoom === 'ceiling') {
            for (let i = 0; i < 60; i += 1) {
              const z = await zoomNow(p);
              await p.getByRole('button', { name: 'Zoom in' }).click();
              await sleep(60);
              if ((await zoomNow(p)) === z) break;
            }
            await p.evaluate(() => { const o = document.querySelector('[data-postr-canvas-outer]'); o.scrollTop = 0; o.scrollLeft = 0; });
            await sleep(250);
          } else await fit(p);
          const z = await zoomNow(p);
          const read = [];
          for (const id of ['zqtl', 'zqtl180']) {
            const sel = await select(p, id);
            const r = await readPlacement(p);
            if (r.error) throw new Error(r.error);
            if (r.overWorkspacePx2 > 0 || r.under.length) observed = true;
            read.push(`${id}${sel ? '' : ' (not selected)'}: over the workspace ${r.overWorkspacePx2} px², under the group [${r.under.join(', ')}]`);
            numbers[`${label} group`] = `${JSON.stringify(r.group)} workspace top ${r.workspaceTop}`;
            await p.keyboard.press('Escape');
          }
          numbers[label] = `zoom ${z}; ${read.join('; ')}`;
        } finally {
          await context.close().catch(() => {});
        }
      }
      return { claims: { B4: observed }, numbers };
    },
  },
  {
    id: 'B4o-top-bar-at-every-width', claims: ['B4o'],
    how: 'the bar holding Undo and Redo at 1280 × 800 (sidebar shown, then hidden), at 900 × 800 with the guidelines panel opened too (a canvas narrower than its gutter, fit-check H6), and at 375 × 812 (a phone: the notice strip at the bottom): nothing clipped or scrolled sideways, the group inside the window and clear of the notice, each button the top element at its centre, and the sidebar\'s Show button (when hidden) clear of the workspace',
    async run(page, ids, reopen, openWith) {
      const numbers = {};
      let observed = false;
      const cases = [
        ['1280 shown', { width: 1280, height: 800 }, null],
        ['1280 hidden', { width: 1280, height: 800 }, 'hide'],
        ['900 both panels', { width: 900, height: 800 }, 'guidelines'],
        ['375 phone', { width: 375, height: 812 }, null],
      ];
      for (const [label, viewport, act] of cases) {
        const { context, page: p } = await openWith({ viewport, poster: { w: 48, h: 36 } });
        try {
          if (act === 'hide') await hideSidebar(p);
          if (act === 'guidelines') {
            const t = p.locator('[data-postr-guidelines-toggle]');
            if (await t.count()) { await t.click(); await sleep(450); }
          }
          const r = await readFit(p);
          if (r.error) throw new Error(`${label}: ${r.error}`);
          const clipped = r.bar ? r.bar.scrollW > r.bar.w + 1 : false;
          const bad = clipped || !r.inWindow || r.noticeMeets || r.revealOverWorkspace > 0 || r.hits.some((x) => !x);
          if (bad) observed = true;
          numbers[label] = `bar ${r.bar ? `${r.bar.w} px wide, scroll ${r.bar.scrollW}, ${r.bar.h} px tall` : 'none'}; group ${JSON.stringify(r.group)} in the window ${r.inWindow}; buttons on top ${JSON.stringify(r.hits)}; phone notice ${r.notice}${r.noticeMeets ? ' OVER the group' : ''}${r.reveal ? `; Show sidebar ${JSON.stringify(r.reveal)}, over the workspace ${r.revealOverWorkspace} px²` : ''}; fit zoom ${await zoomNow(p)}`;
        } finally {
          await context.close().catch(() => {});
        }
      }
      return { claims: { B4o: observed }, numbers };
    },
  },
];
