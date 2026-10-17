/**
 * The editor's controls as ruler-check.mjs and its libraries drive them
 * (fix 04): the guidelines panel, the ZoomBar's buttons, the sidebar, the
 * canvas's scroll, the Layout tab's size menu and its dialog. Each is the
 * user's own control, found by its name or label; nothing here calls the
 * app's code.
 */
/** Open or close the guidelines panel (its "Show" toggle exists only while it is closed). */
export async function setGuidelines(page, open) {
  const isOpen = !(await page.$('[title="Show poster guidelines"]'));
  if (isOpen === open) return;
  await page.click(open ? '[title="Show poster guidelines"]' : '[title="Hide guidelines"]');
  await page.waitForTimeout(600);
}
export const clickButton = async (page, name, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await page.getByRole('button', { name }).click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(250);
};

/** Hide the sidebar by its button and let its width animation end. */
export async function hideSidebar(page) {
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await page.waitForTimeout(900);
}
export const scrollTo = (p, x, y) => p.evaluate(([sx, sy]) => {
  const o = document.querySelector('[data-postr-canvas-outer]');
  o.scrollTo(sx === 'end' ? o.scrollWidth : sx, sy === 'end' ? o.scrollHeight : sy);
  return { x: o.scrollLeft, y: o.scrollTop };
}, [x, y]);
export const settle = (p, ms = 700) => p.waitForTimeout(ms);
export const rafs = (p, k) => p.evaluate((n) => new Promise((r) => {
  let i = 0;
  const f = () => { i += 1; if (i >= n) r(); else requestAnimationFrame(f); };
  requestAnimationFrame(f);
}), k);
export const layoutTab = async (p) => {
  await p.locator('[data-postr-tab]', { hasText: 'layout' }).click();
  await p.getByLabel('Poster size', { exact: true }).waitFor();
};
export const changeSizeButton = (p) => p.locator('[data-postr-modal-backdrop]').getByRole('button', { name: 'Change size', exact: true });
export const noDialog = (p) => p.locator('[data-postr-modal-backdrop]').waitFor({ state: 'detached' });
