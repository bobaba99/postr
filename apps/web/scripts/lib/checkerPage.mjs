/**
 * checkerPage.mjs - the plot checker's page, driven as a user drives it: type
 * the print size, paste a script, press Check, read the table the page
 * renders (and the fix list, the copied code, the warnings, the one-number
 * advice), press "Copy edited code". Shared by scripts/checker-truth-check.mjs
 * (Python) and scripts/checker-r-truth-check.mjs (R, part 2); moved here
 * unchanged from the first so both read the page the same way.
 *
 * Fix 13b: a size the code does not set is shown with a trailing "*" in the
 * Source cell (the default the check assumed), and a printed scale the code
 * does not fix (no canvas size, a tight save, a seaborn grid) with a "*" on
 * the scale line: `rows[].assumed` and `scaleAssumed`. A row with either
 * carries a missing-setting warning, which the scoring counts apart.
 */
export async function setSize(page, { w, h }) {
  for (const [label, v] of [['Width', w], ['Height', h]]) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(String(v));
    await input.press('Enter');
  }
}

/** Everything the result area shows, read from the DOM of the FRESH table. */
export function readReport(page) {
  return page.evaluate(() => {
    const leaf = (re) => [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && re.test(d.textContent.trim()));
    const table = [...document.querySelectorAll('table')].find((t) => !t.dataset.zqOld && /Element/.test(t.querySelector('thead')?.textContent ?? ''));
    const detected = leaf(/^(Detected: .*|Auto-detect waiting for code…|Can’t tell R from Python\. Pick one above\.)$/)?.textContent.trim() ?? null;
    if (!table) return { detected, table: false, rows: [] };
    const panel = table.parentElement;
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
      const td = [...tr.querySelectorAll('td')].map((c) => c.textContent.trim());
      return { name: td[0], sourcePt: parseFloat(td[1]), printPt: parseFloat(td[2]), minPt: parseFloat(td[3]), glyph: td[4], assumed: /\*$/.test(td[1]) };
    });
    const scaleEl = [...panel.querySelectorAll('div')].find((d) => /^Scale factor:/.test(d.textContent.trim()));
    const scale = scaleEl ? parseFloat(scaleEl.textContent.trim().replace(/^Scale factor:\s*/, '')) : null;
    const scaleAssumed = scaleEl ? /\*/.test(scaleEl.textContent) : false;
    const warnings = [...panel.children].filter((c) => c.textContent.trim().startsWith('⚠')).map((c) => c.textContent.trim().slice(1).trim());
    const copyBtn = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Copy edited code');
    let fixShown = null;
    let fixList = [];
    if (copyBtn) {
      const block = copyBtn.parentElement.parentElement; // the "Raise these text elements" column
      fixShown = block.querySelector('pre')?.textContent ?? null;
      fixList = [...block.querySelectorAll('li')].map((li) => {
        const m = li.textContent.match(/^(.+?):\s*([\d.]+)pt\s*→\s*([\d.]+)pt/);
        return m
          ? { name: m[1], currentPt: parseFloat(m[2]), neededPt: parseFloat(m[3]), youSetThis: /\(you set this\)/.test(li.textContent) }
          : { raw: li.textContent };
      });
    }
    const allPassBanner = [...panel.querySelectorAll('div')].some((d) => d.textContent.trim() === 'Every element in the table meets its minimum at this poster size.');
    // Part 2 (D): the secondary advice, "Or change one number: font.size = N",
    // and the one-line snippet under it (its <details> need not be open).
    const sum = [...panel.querySelectorAll('details > summary')].find((d) => /^Or change one number:/.test(d.textContent.trim()));
    const snippetSummary = sum ? sum.textContent.trim() : null;
    const snippet = sum ? (sum.parentElement.querySelector('pre')?.textContent ?? null) : null;
    return { detected, table: true, rows, scale, scaleAssumed, warnings, hasCopy: !!copyBtn, fixShown, fixList, allPassBanner, snippetSummary, snippet };
  });
}

export async function check(page, code) {
  // Mark the tables on screen, so the read below can only see the one this
  // Check renders (the panel is keyed on the checked code and remounts).
  await page.evaluate(() => document.querySelectorAll('table').forEach((t) => { t.dataset.zqOld = '1'; }));
  await page.getByLabel('Your R or Python plotting code').fill(code);
  await page.getByRole('button', { name: '▶ Check' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('table')].some((t) => !t.dataset.zqOld && /Element/.test(t.textContent)),
    null, { timeout: 5000 },
  ).catch(() => {});
  return readReport(page);
}

/**
 * Let the page's clipboard be read, in every engine (fix 13b). Chromium is
 * granted the clipboard permissions. Playwright's Firefox and WebKit have no
 * such permission, so there an init script records what the page hands to
 * navigator.clipboard.writeText (the only way the panel copies,
 * ReadabilityCodeView.tsx CopyButton), passes it on to the real clipboard,
 * and readText returns the record.
 */
export async function allowClipboard(context, base, engine) {
  if (engine === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    return;
  }
  await context.addInitScript(() => {
    const clip = navigator.clipboard;
    if (!clip) return;
    const write = clip.writeText.bind(clip);
    let held = '';
    clip.writeText = (t) => {
      held = String(t);
      return write(t).catch(() => {});
    };
    clip.readText = async () => held;
  });
}

/** Press "Copy edited code" and return what the page put on the clipboard. */
export async function copyCorrected(page) {
  const SENTINEL = '__ZQ_CLIPBOARD_EMPTY__';
  await page.evaluate((s) => navigator.clipboard.writeText(s), SENTINEL);
  await page.getByRole('button', { name: 'Copy edited code' }).click();
  const got = await page.waitForFunction(
    async (s) => { const t = await navigator.clipboard.readText(); return t !== s ? t : null; },
    SENTINEL, { timeout: 3000, polling: 50 },
  ).then((hnd) => hnd.jsonValue()).catch(() => null);
  return got;
}

