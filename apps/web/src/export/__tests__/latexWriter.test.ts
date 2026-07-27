/**
 * LaTeX writer — string-level assertions on the emitted document
 * (plan §6). Coordinates must land VERBATIM, escapes must hold, and
 * the preamble must match the article+geometry+textpos design.
 */
import { describe, expect, it } from 'vitest';
import { buildLatexDocument, paragraphsToLatex } from '../latex/writer';
import { parseRichText } from '../richText';
import { baseBlock, makeFixtureDoc } from './fixtures';

const doc = makeFixtureDoc();
const assetPaths = new Map([['img1', 'figures/figure-1.png']]);

describe('buildLatexDocument — preamble', () => {
  const { tex } = buildLatexDocument(doc, { assetPaths });

  it('uses article + geometry with the exact poster size', () => {
    expect(tex).toContain('\\documentclass{article}');
    expect(tex).toContain(
      '\\usepackage[paperwidth=48in,paperheight=36in,margin=0in]{geometry}',
    );
  });

  it('sets the textpos module to exactly one Postr unit', () => {
    expect(tex).toContain('\\usepackage[absolute,overlay]{textpos}');
    expect(tex).toContain('\\setlength{\\TPHorizModule}{0.1in}');
    expect(tex).toContain('\\setlength{\\TPVertModule}{0.1in}');
  });

  it('sets up fontspec with the poster family plus a pdfLaTeX fallback', () => {
    expect(tex).toContain('\\usepackage{fontspec}');
    expect(tex).toContain('\\setmainfont{Source Sans 3}');
    expect(tex).toContain('%%   \\usepackage[default]{sourcesanspro}');
  });

  it('defines the poster palette as named colors', () => {
    expect(tex).toContain('\\definecolor{postrBg}{HTML}{FFFFFF}');
    expect(tex).toContain('\\definecolor{postrPrimary}{HTML}{1A1A2E}');
    expect(tex).toContain('\\definecolor{postrAccent}{HTML}{0F4C75}');
  });

  it('emits a full-size document for >56in posters (no PPTX ceiling)', () => {
    const big = makeFixtureDoc({ widthIn: 72, heightIn: 48 });
    const out = buildLatexDocument(big).tex;
    expect(out).toContain('paperwidth=72in,paperheight=48in');
  });
});

describe('buildLatexDocument — blocks', () => {
  const { tex } = buildLatexDocument(doc, { assetPaths });

  it('emits textblock coordinates verbatim, including decimals', () => {
    expect(tex).toContain('\\begin{textblock}{240}(20,15.5)');
    expect(tex).toContain('\\begin{textblock}{120}(200,95)');
  });

  it('renders the title with exact point sizes (14u → 100.8pt)', () => {
    expect(tex).toContain('\\fontsize{100.8pt}{115.92pt}\\selectfont');
    expect(tex).toContain('\\bfseries');
  });

  it('escapes entities and maps inline bold in the title', () => {
    expect(tex).toContain('Whisker Maps \\& \\textbf{Naps}: 100\\% Cat Science');
  });

  it('renders authors with superscript affiliation markers', () => {
    expect(tex).toContain('John Smith\\textsuperscript{1,†}');
    expect(tex).toContain('Jane Doe\\textsuperscript{1,2}');
    expect(tex).toContain('\\textsuperscript{1}Acme State University, Dept. of Cat Studies');
    expect(tex).toContain('†Corresponding author');
  });

  it('renders the numbered heading with the default bottom border rule', () => {
    expect(tex).toContain('1.~Methods');
    // Rule width is the block's EXPLICIT width (15in for w=150u) —
    // \linewidth does not track textpos's \hsize — and it stays
    // inside the paragraph (a \\ after \par cannot compile).
    expect(tex).toContain('\\\\[2pt]{\\color{postrAccent}\\rule{15in}{1pt}}\\par');
  });

  it('renders text paragraphs with italics and lists', () => {
    expect(tex).toContain('We measured \\textit{n} = 12 naps.');
    expect(tex).toContain('\\begin{itemize}');
    expect(tex).toContain('\\item long naps');
  });

  it('includes the figure with its numbered caption after (bottom position)', () => {
    const graphicIdx = tex.indexOf('\\includegraphics[width=12in,height=9in,keepaspectratio]{figures/figure-1.png}');
    const captionIdx = tex.indexOf('\\textbf{Figure 1.} Nap duration by whisker length');
    expect(graphicIdx).toBeGreaterThan(-1);
    expect(captionIdx).toBeGreaterThan(graphicIdx);
  });

  it('separates caption/graphic parts with \\vspace, never \\\\ after \\par', () => {
    // Every sub-part ends in \par (vertical mode); a \\ separator
    // there is the "no line here to end" compile error.
    expect(tex).not.toMatch(/\\par\}*\\\\/);
    expect(tex).toContain('\\vspace{4pt}');
  });

  it('renders the APA table with top, header, and bottom rules only', () => {
    expect(tex).toContain('\\begin{tabular}{p{7.38in}p{7.38in}}');
    expect(tex).toContain('\\textbf{Group} & \\textbf{Naps} \\\\');
    expect(tex).toContain('Cats \\& kittens & \\textbf{42} \\\\');
    // APA: exactly 3 \hline (top, under header, bottom).
    const tableSection = tex.slice(tex.indexOf('\\begin{tabular}'), tex.indexOf('\\end{tabular}'));
    expect(tableSection.match(/\\hline/g)).toHaveLength(3);
  });

  it('wraps rotated blocks in \\rotatebox with negated (ccw) degrees', () => {
    expect(tex).toContain('\\rotatebox[origin=c]{-15}{\\begin{minipage}{8in}');
  });

  it('renders references with the citation style and italic journal', () => {
    expect(tex).toContain('References');
    expect(tex).toContain('Smith, J. (2026). Whisker-driven navigation.');
    expect(tex).toContain('\\emph{Journal of Sample Research}');
  });

  it('emits a placeholder box and warning for unresolvable images', () => {
    const { tex: out, warnings } = buildLatexDocument(doc); // no assetPaths
    expect(out).toContain('missing image');
    expect(warnings.some((w) => w.includes('placeholder'))).toBe(true);
  });
});

describe('buildLatexDocument — hostile content stays inert', () => {
  it('escapes command injection in text blocks', () => {
    const hostile = makeFixtureDoc({
      blocks: [
        baseBlock({
          id: 't',
          type: 'text',
          content: '\\write18{rm -rf /} $ &amp; #',
        }),
      ],
    });
    const { tex } = buildLatexDocument(hostile);
    expect(tex).not.toContain('\\write18{');
    expect(tex).toContain('\\textbackslash{}write18\\{rm -rf /\\} \\$ \\& \\#');
  });
});

describe('paragraphsToLatex', () => {
  it('joins plain paragraphs with line breaks, none trailing', () => {
    const out = paragraphsToLatex(parseRichText('one<br>two'));
    expect(out).toBe('one\\\\\ntwo');
  });

  it('keeps interior blank lines as ~', () => {
    const out = paragraphsToLatex(parseRichText('a<br><br>b'));
    expect(out).toBe('a\\\\\n~\\\\\nb');
  });

  it('numbers ordered lists with a start offset', () => {
    const out = paragraphsToLatex(parseRichText('<ol start="3"><li>x</li></ol>'));
    expect(out).toContain('\\begin{enumerate}');
    expect(out).toContain('\\setcounter{enumi}{2}');
  });
});
