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
    const doc = makeFixtureDoc({ references: [] });
    const { bytes } = await exportPosterLatex(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const entries = unzipSync(bytes);
    expect(entries['references.bib']).toBeUndefined();
    expect(entries['poster.tex']).toBeDefined();
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
