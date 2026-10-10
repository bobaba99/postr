/**
 * The copy inventory's reader (src/test/copyScan.ts) on small sources whose
 * answer is known: which strings it reads, how it joins a sentence, and
 * which ones it counts as reachable only with the LaTeX export switched on.
 * The inventory (src/__tests__/copyInventory.test.ts) is only as good as
 * this reader, so its rules are pinned here one by one.
 *
 * Re-run: npx vitest run src/test/__tests__/copyScan.test.ts
 */
import { describe, expect, it } from 'vitest';
import { LATEX_CLAIM, PRICE, TAX_BEFORE_PERIOD, TAX_NOTE, pricesWithTax, scanSource } from '../copyScan';

const FLAG_IMPORT = "import { LATEX_EXPORT_ENABLED } from '@/config/features';\n";

const texts = (src: string, file = 'a.tsx') => scanSource(file, src).filter((t) => t.kind === 'string' || t.kind === 'jsx');
const textOf = (src: string, needle: string) => texts(src).find((t) => t.text.includes(needle));

describe('what the reader reads', () => {
  it('reads string literals, template literals and a + chain as one string', () => {
    const src = `const a = 'one'; const b = \`two \${x} three\`; const c = 'four ' + n + ' five';`;
    expect(texts(src, 'a.ts').map((t) => t.text)).toEqual(['one', 'two {} three', 'four {} five']);
  });

  it('joins a JSX element’s text over lines and around a string child', () => {
    const src = `const el = <p>Your PDF export
      is free.{' '}Pay for <strong>PowerPoint</strong> only.</p>;`;
    expect(texts(src).map((t) => t.text)).toEqual(['Your PDF export is free. Pay for {} only.', 'PowerPoint']);
  });

  it('reads attribute strings and leaves comments and string literal types out', () => {
    const src = `type Kind = 'latex' | 'pptx';
      // LaTeX in a comment
      /* LaTeX in a block comment */
      const el = <img alt="a LaTeX logo" />;`;
    expect(texts(src).map((t) => t.text)).toEqual(['a LaTeX logo']);
  });

  it('keeps import specifiers apart, static and dynamic', () => {
    const all = scanSource('a.ts', `import x from './x';\nconst m = import('@/export/latex/exportLatex');`);
    expect(all.filter((t) => t.kind === 'module').map((t) => t.text)).toEqual(['./x', '@/export/latex/exportLatex']);
  });

  it('gives each string its line', () => {
    const src = `const a = 'one';\n\nconst b = 'two';`;
    expect(texts(src, 'a.ts').map((t) => t.line)).toEqual([1, 3]);
  });
});

describe('which strings only the LaTeX switch reaches', () => {
  it('guards the right side of `FLAG && …`, also as a later conjunct', () => {
    const src = `${FLAG_IMPORT}const a = LATEX_EXPORT_ENABLED && 'LaTeX one';
      const b = ready && LATEX_EXPORT_ENABLED && 'LaTeX two';
      const c = <div>{LATEX_EXPORT_ENABLED && (<button>LaTeX three</button>)}</div>;`;
    for (const n of ['one', 'two', 'three']) expect(textOf(src, `LaTeX ${n}`)?.guarded, n).toBe(true);
  });

  it('guards the true branch of `FLAG ? … : …` and not the false one', () => {
    const src = `${FLAG_IMPORT}const a = LATEX_EXPORT_ENABLED ? 'LaTeX yes' : 'PDF no';`;
    expect(textOf(src, 'LaTeX yes')?.guarded).toBe(true);
    expect(textOf(src, 'PDF no')?.guarded).toBe(false);
  });

  it('guards the false branch of a `!FLAG` condition', () => {
    const src = `${FLAG_IMPORT}const a = !LATEX_EXPORT_ENABLED ? 'PDF' : 'LaTeX';
      if (!LATEX_EXPORT_ENABLED) { f('PDF only'); } else { f('LaTeX else'); }`;
    expect(textOf(src, 'LaTeX')?.guarded).toBe(true);
    expect(textOf(src, 'LaTeX else')?.guarded).toBe(true);
    expect(textOf(src, 'PDF only')?.guarded).toBe(false);
  });

  it('guards the body of `if (FLAG)`, a dynamic import in it included', () => {
    const src = `${FLAG_IMPORT}function go() { if (LATEX_EXPORT_ENABLED) { run(import('@/export/latex/x'), 'a-latex.zip'); } f('after'); }`;
    const all = scanSource('a.ts', src);
    expect(all.find((t) => t.text === '@/export/latex/x')?.guarded).toBe(true);
    expect(all.find((t) => t.text === 'a-latex.zip')?.guarded).toBe(true);
    expect(all.find((t) => t.text === 'after')?.guarded).toBe(false);
  });

  it('does not guard `FLAG || …`, a negated `&&`, or the false branch of `FLAG ? …`', () => {
    const src = `${FLAG_IMPORT}const a = LATEX_EXPORT_ENABLED || 'LaTeX or';
      const b = !LATEX_EXPORT_ENABLED && 'LaTeX not';
      const c = LATEX_EXPORT_ENABLED ? 'x' : 'LaTeX else';`;
    for (const n of ['or', 'not', 'else']) expect(textOf(src, `LaTeX ${n}`)?.guarded, n).toBe(false);
  });

  it('counts only the switch imported from config/features', () => {
    const local = `const LATEX_EXPORT_ENABLED = true;\nconst a = LATEX_EXPORT_ENABLED && 'LaTeX local';`;
    const renamed = `import { RULERS_ENABLED as LATEX_EXPORT_ENABLED } from '@/config/features';\nconst a = LATEX_EXPORT_ENABLED && 'LaTeX renamed';`;
    const elsewhere = `import { LATEX_EXPORT_ENABLED } from './flags';\nconst a = LATEX_EXPORT_ENABLED && 'LaTeX elsewhere';`;
    expect(textOf(local, 'LaTeX local')?.guarded).toBe(false);
    expect(textOf(renamed, 'LaTeX renamed')?.guarded).toBe(false);
    expect(textOf(elsewhere, 'LaTeX elsewhere')?.guarded).toBe(false);
  });

  it('a string after an early `if (!FLAG) return` is not guarded (the reader does not follow control flow)', () => {
    const src = `${FLAG_IMPORT}function go() { if (!LATEX_EXPORT_ENABLED) return; f('LaTeX late'); }`;
    expect(textOf(src, 'LaTeX late')?.guarded).toBe(false);
  });
});

describe('record 29: the other hide switches, the enclosing component and the elements', () => {
  const FLAGS = "import { IMPORT_ENABLED, ADJUSTMENTS_ENABLED, EDITOR_EXTRAS_ENABLED } from '@/config/features';\n";

  it('lists every switch a string is reached through, nested guards included', () => {
    const src = `${FLAGS}const a = IMPORT_ENABLED && 'Import one';
      const b = ADJUSTMENTS_ENABLED ? (EDITOR_EXTRAS_ENABLED ? 'both' : 'adjust only') : 'neither';
      const c = !EDITOR_EXTRAS_ENABLED ? 'plain' : 'Staples';`;
    expect(textOf(src, 'Import one')?.guardedBy).toEqual(['IMPORT_ENABLED']);
    expect([...(textOf(src, 'both')?.guardedBy ?? [])].sort()).toEqual(['ADJUSTMENTS_ENABLED', 'EDITOR_EXTRAS_ENABLED']);
    expect(textOf(src, 'adjust only')?.guardedBy).toEqual(['ADJUSTMENTS_ENABLED']);
    expect(textOf(src, 'neither')?.guardedBy).toEqual([]);
    expect(textOf(src, 'Staples')?.guardedBy).toEqual(['EDITOR_EXTRAS_ENABLED']);
    expect(textOf(src, 'plain')?.guardedBy).toEqual([]);
    expect(textOf(src, 'Import one')?.guarded, 'the LaTeX entry stays apart').toBe(false);
  });

  it('a function call holding the switch is not a guard (the reader reads syntax)', () => {
    const src = `${FLAGS}const only = (on, x) => (on ? [x] : []);\nconst steps = [...only(IMPORT_ENABLED, { body: 'Import it' })];`;
    expect(textOf(src, 'Import it')?.guardedBy).toEqual([]);
  });

  it('names the enclosing function, declared or assigned to a const, else null', () => {
    const src = `const top = 'module';
      function Panel() { return <p>in panel</p>; }
      const Card = () => { const inner = () => 'nested'; return 'in card'; };`;
    expect(textOf(src, 'module')?.component).toBe(null);
    expect(textOf(src, 'in panel')?.component).toBe('Panel');
    expect(textOf(src, 'in card')?.component).toBe('Card');
    expect(textOf(src, 'nested')?.component).toBe('inner');
  });

  it('keeps each component element with its guards; lowercase tags are not elements', () => {
    const src = `${FLAGS}const el = <div><ImportSection />{ADJUSTMENTS_ENABLED && <CropHint a="b" />}<span>x</span></div>;`;
    const elements = scanSource('a.tsx', src).filter((t) => t.kind === 'element');
    expect(elements.map((t) => [t.text, t.guardedBy])).toEqual([['ImportSection', []], ['CropHint', ['ADJUSTMENTS_ENABLED']]]);
  });
});

describe('the patterns', () => {
  it.each([
    ['LaTeX source (.zip)', true],
    ['XeLaTeX or LuaLaTeX', true],
    ['Keep editing in PowerPoint or Overleaf', true],
    ['A poster.tex for you', true],
    ['BibTeX and RIS files', false],
    ['translateX(-50%)', false],
    ['PowerPoint (.pptx)', false],
  ])('LaTeX claim in %j: %s', (s, hit) => {
    expect(LATEX_CLAIM.test(s)).toBe(hit);
  });

  it.each([
    ['CA$18.99', true],
    ['$18.99 CAD / 4-month term', true],
    ['CA$5 goodwill', true],
    ['18,99 $ tous les 4 mois', true],
    ['18.99 CAD', true],
    ['$0', false],
    ['$1$2', false],
    ['CA${}', false],
    ['13.33 x 7.5 in', false],
  ])('price in %j: %s', (s, hit) => {
    expect(PRICE.test(s)).toBe(hit);
  });

  it.each([
    ['CA$18.99 + applicable taxes', true],
    ['18,99 $ plus les taxes applicables', true],
    ['taxe de vente', true],
    ['syntax error', false],
    ['taxonomy', false],
  ])('tax note in %j: %s', (s, hit) => {
    expect(TAX_NOTE.test(s)).toBe(hit);
  });

  it.each([
    ['Term · CA$18.99 + applicable taxes / 4 months', true],
    ['$18.99 CAD + applicable taxes / 4-month term', true],
    ['CA$18.99 + applicable taxes per 4 months', true],
    ['18,99 $ + taxes applicables / 4 mois', true],
    ['Term · CA$18.99 every 4 months + applicable taxes', false],
    ['the term at CA$18.99 + applicable taxes (renews every 4 months, cancel anytime)', false],
    ['The CA$18.99 term, plus applicable taxes, gives unlimited PowerPoint exports', false],
    ['Export pack · CA$9.99 + applicable taxes', false],
  ])('tax note before the period in %j: %s', (s, hit) => {
    expect(TAX_BEFORE_PERIOD.test(s)).toBe(hit);
  });
});

describe('a tax note beside each price', () => {
  it('reads each price with the 40 characters after it', () => {
    const r = pricesWithTax('The CA$18.99 term or a one-time CA$9.99 pack of 3, each plus applicable taxes.');
    expect(r.map((p) => [p.price, p.taxed])).toEqual([['CA$18.99', false], ['CA$9.99', true]]);
  });

  it('reads a note across a line break, and not one 41 characters away', () => {
    const taxed = (text: string) => pricesWithTax(text).map((p) => p.taxed);
    expect(taxed('CA$9.99\n  every 4 months\n  + applicable taxes')).toEqual([true]);
    expect(taxed(`CA$9.99${'x'.repeat(41)} taxes`)).toEqual([false]);
    expect(taxed(`CA$9.99${'x'.repeat(33)} taxes`)).toEqual([true]);
  });
});
