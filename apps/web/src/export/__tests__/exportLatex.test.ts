/**
 * LaTeX bundle assembly — the deliverable is a zip with poster.tex,
 * figures/, references.bib, and a README (plan §4: "a bare .tex
 * with broken image paths is not an export").
 */
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { exportPosterLatex } from '../latex/exportLatex';
import { makeFixtureDoc, TINY_PNG_BYTES } from './fixtures';

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('exportPosterLatex', () => {
  it('bundles tex, figure, bib, and README with wired paths', async () => {
    const doc = makeFixtureDoc();
    const { bytes, warnings } = await exportPosterLatex(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const entries = unzipSync(bytes);

    expect(Object.keys(entries).sort()).toEqual([
      'README.txt',
      'figures/figure-1.png',
      'poster.tex',
      'references.bib',
    ]);

    const tex = decode(entries['poster.tex']!);
    expect(tex).toContain('\\includegraphics[width=12in,height=9in,keepaspectratio]{figures/figure-1.png}');
    expect(entries['figures/figure-1.png']).toEqual(TINY_PNG_BYTES);

    const bib = decode(entries['references.bib']!);
    expect(bib).toContain('@article{smith2026,');

    const readme = decode(entries['README.txt']!);
    expect(readme).toContain('xelatex poster.tex');
    expect(readme).toContain('Source Sans 3');

    expect(warnings).toEqual([]);
  });

  it('names figure files by caption number', async () => {
    const doc = makeFixtureDoc();
    const { bytes } = await exportPosterLatex(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const entries = unzipSync(bytes);
    expect(entries['figures/figure-1.png']).toBeDefined();
  });

  it('omits references.bib when the poster has no references', async () => {
    // Restored: v2 weakened this to require `paidPlan: true`, because
    // the credit alone kept a one-entry .bib alive. No references of
    // its own now means no .bib, credit active or not.
    const doc = makeFixtureDoc({ references: [] });
    const { bytes } = await exportPosterLatex(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const entries = unzipSync(bytes);
    expect(entries['references.bib']).toBeUndefined();
    expect(entries['poster.tex']).toBeDefined();
  });

  it('still ships references.bib with the credit when the poster HAS references', async () => {
    const doc = makeFixtureDoc();
    const { bytes } = await exportPosterLatex(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const entries = unzipSync(bytes);
    const bib = new TextDecoder().decode(entries['references.bib']!);
    expect(bib).toContain('@misc{postr,');
  });

  it('degrades unresolvable images to placeholders with one deduped warning', async () => {
    const doc = makeFixtureDoc();
    const { bytes, warnings } = await exportPosterLatex(doc, {
      fetcher: async () => null,
    });
    const entries = unzipSync(bytes);
    expect(entries['figures/figure-1.png']).toBeUndefined();
    expect(decode(entries['poster.tex']!)).toContain('missing image');
    expect(warnings.filter((w) => w.includes('placeholder'))).toHaveLength(1);
  });

  it('respects the citation style option in the emitted tex', async () => {
    const doc = makeFixtureDoc();
    const { bytes } = await exportPosterLatex(doc, {
      fetcher: async () => TINY_PNG_BYTES,
      citationStyle: 'IEEE',
    });
    const tex = decode(unzipSync(bytes)['poster.tex']!);
    // Brackets are escaped ({[}1{]} renders as "[1]") so the numbered
    // prefix can never parse as an optional argument after \\.
    expect(tex).toContain('{[}1{]} J. Smith');
  });
});

/**
 * Every sentence in README.txt is checked against the files it ships
 * beside, through the same `exportPosterLatex` call the export button
 * makes. `paidPlan: true` because that is the only LaTeX export a user
 * can reach (EditableExportButtons passes `paidPlan: canExport`, and the
 * button is disabled or gated without it).
 */
describe('README.txt claims match the files it ships with', () => {
  const exportFiles = async (doc: ReturnType<typeof makeFixtureDoc>) => {
    const { bytes } = await exportPosterLatex(doc, {
      fetcher: async () => TINY_PNG_BYTES,
      attribution: { paidPlan: true },
    });
    const entries = unzipSync(bytes);
    return {
      entries,
      readme: decode(entries['README.txt']!),
      tex: decode(entries['poster.tex']!),
    };
  };

  it('does not send a Charter poster to Google Fonts, which has no Charter page', async () => {
    const { readme } = await exportFiles(makeFixtureDoc({ fontFamily: 'Charter' }));
    expect(readme).toContain('"Charter"');
    expect(readme).not.toContain('fonts.google.com');
    expect(readme).not.toContain('Google Fonts');
  });

  it('links a curated family that Google Fonts carries to its specimen page', async () => {
    const { readme } = await exportFiles(makeFixtureDoc({ fontFamily: 'IBM Plex Sans' }));
    expect(readme).toContain('https://fonts.google.com/specimen/IBM%2BPlex%2BSans');
  });

  it.each(['Source Sans 3', 'Charter', 'Lora', 'Inter'])(
    'mentions a pdfLaTeX fallback block only when poster.tex has one (%s)',
    async (fontFamily) => {
      const { readme, tex } = await exportFiles(makeFixtureDoc({ fontFamily }));
      expect(/fallback/i.test(readme)).toBe(tex.includes('pdfLaTeX fallback'));
    },
  );

  it('says the file needs XeLaTeX or LuaLaTeX because it loads fontspec', async () => {
    const { readme, tex } = await exportFiles(makeFixtureDoc());
    expect(tex).toContain('\\usepackage{fontspec}');
    expect(readme).toContain('loads fontspec');
    // No compile was run to back "LuaLaTeX also works", so it is not claimed.
    expect(readme).not.toMatch(/also works/i);
  });

  it('says figures/ holds the image files unchanged, and they are the fetched bytes', async () => {
    const { readme, entries } = await exportFiles(makeFixtureDoc());
    expect(readme).toContain('copied unchanged');
    expect(entries['figures/figure-1.png']).toEqual(TINY_PNG_BYTES);
  });

  it('says poster.tex does not read references.bib, and it does not', async () => {
    const { readme, tex } = await exportFiles(makeFixtureDoc());
    expect(readme).toContain('poster.tex does not read it');
    // Comment lines may name \bibliography; only TeX that runs counts.
    const code = tex
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('%'))
      .join('\n');
    expect(code).not.toMatch(/\\bibliography|\\nocite|\\cite\{/);
    expect(readme).not.toMatch(/matches the original/i);
  });

  it('claims a plain-text reference list only when poster.tex prints one', async () => {
    const withBlock = makeFixtureDoc();
    const withoutBlock = {
      ...withBlock,
      blocks: withBlock.blocks.filter((b) => b.type !== 'references'),
    };
    for (const doc of [withBlock, withoutBlock]) {
      const { readme, tex } = await exportFiles(doc);
      expect(readme.includes('reference list as literal text')).toBe(tex.includes('{References}'));
    }
  });
});
