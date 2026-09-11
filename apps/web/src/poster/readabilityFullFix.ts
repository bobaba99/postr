/**
 * "Full edited code" — the pasted script with the recommended base_size
 * applied and, when the script never saves its figure, a save call
 * appended.
 *
 * The appended save call carries the canvas the check was SCORED
 * against (`params.canvasWidth/Height`): with no ggsave()/figsize in
 * the code that is the typed print size on the public page, or the
 * figure-preview overlay in the editor. A hardcoded size here would
 * hand back a script whose canvas has nothing to do with the base_size
 * it recommends — the exact failure the check exists to prevent.
 */
import type { FigureParams } from './readability';

/** "24", "23.4" — never "24.0" or float noise like 16.549999. */
function formatInches(n: number): string {
  return String(Math.round(n * 100) / 100);
}

const R_BASE_SIZE = /base_size\s*=\s*[\d.]+/;
const R_THEME_CALL = /(theme_\w+\s*\()/;
const PY_FONT_SIZE_RC = /(rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*)[\d.]+/;
const PY_FONT_SCALE = /font_scale\s*=\s*[\d.]+/;

function fixR(code: string, params: FigureParams, suggested: number): string {
  const withBase = R_BASE_SIZE.test(code)
    ? code.replace(new RegExp(R_BASE_SIZE.source, 'g'), `base_size = ${suggested}`)
    : R_THEME_CALL.test(code)
      ? code.replace(R_THEME_CALL, `$1base_size = ${suggested}, `)
      : `${code.trimEnd()} +\n  theme_minimal(base_size = ${suggested})`;

  if (/ggsave/.test(withBase)) return withBase;
  const w = formatInches(params.canvasWidth);
  const h = formatInches(params.canvasHeight);
  return `${withBase.trimEnd()}\n\nggsave("poster_figure.png", width = ${w}, height = ${h}, dpi = 300)`;
}

function fixPython(code: string, params: FigureParams, suggested: number): string {
  const hasFigsize = /figsize\s*=/.test(code);
  const figsizeLine = `plt.rcParams['figure.figsize'] = (${formatInches(params.canvasWidth)}, ${formatInches(params.canvasHeight)})`;

  let fixed: string;
  if (PY_FONT_SIZE_RC.test(code)) {
    fixed = code.replace(PY_FONT_SIZE_RC, `$1${suggested}`);
    if (!hasFigsize) {
      // Right after the font.size line, so the two rcParams read as a pair.
      fixed = fixed.replace(/^(.*rcParams\s*\[\s*['"]font\.size['"]\s*\].*)$/m, `$1\n${figsizeLine}`);
    }
  } else if (PY_FONT_SCALE.test(code)) {
    fixed = code.replace(PY_FONT_SCALE, `font_scale=${(suggested / 10).toFixed(1)}`);
    if (!hasFigsize) fixed = `import matplotlib.pyplot as plt\n${figsizeLine}\n\n${fixed}`;
  } else {
    const header = [
      'import matplotlib.pyplot as plt',
      `plt.rcParams['font.size'] = ${suggested}`,
      ...(hasFigsize ? [] : [figsizeLine]),
    ].join('\n');
    fixed = `${header}\n\n${code}`;
  }

  if (/savefig/.test(fixed)) return fixed;
  return `${fixed.trimEnd()}\n\nplt.savefig("poster_figure.png", dpi=300, bbox_inches="tight")`;
}

export function generateFullFix(code: string, params: FigureParams, suggested: number): string {
  return params.language === 'r' ? fixR(code, params, suggested) : fixPython(code, params, suggested);
}
