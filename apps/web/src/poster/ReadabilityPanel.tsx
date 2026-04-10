import { useState, useMemo, type CSSProperties } from 'react';
import type { Block } from '@postr/shared';
import { PX } from './constants';
import {
  parseRCode,
  parsePythonCode,
  computeReadability,
  type ReadabilityResult,
  type FigureParams,
} from './readability';

interface Props {
  selectedBlock: Block | null;
}

const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14,
};
const textareaStyle: CSSProperties = {
  width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 13,
  background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a',
  borderRadius: 6, padding: 10, resize: 'vertical',
};
const labelStyle: CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const,
  letterSpacing: 1.2,
};
const copyBtnStyle: CSSProperties = {
  cursor: 'pointer', background: '#313244', color: '#cdd6f4',
  border: '1px solid #45475a', borderRadius: 6, padding: '6px 12px',
  fontSize: 13, fontFamily: 'monospace',
};

/**
 * Generate full corrected code with the suggested base_size applied,
 * not just a single-line snippet.
 */
function generateFullFix(code: string, params: FigureParams, suggested: number): string {
  let fixed = code;

  if (params.language === 'r') {
    // Replace existing base_size or add theme_minimal with base_size
    if (/base_size\s*=\s*[\d.]+/.test(fixed)) {
      fixed = fixed.replace(/base_size\s*=\s*[\d.]+/g, `base_size = ${suggested}`);
    } else if (/theme_\w+\s*\(/.test(fixed)) {
      fixed = fixed.replace(/(theme_\w+\s*\()/, `$1base_size = ${suggested}, `);
    } else {
      fixed = fixed.trimEnd() + ` +\n  theme_minimal(base_size = ${suggested})`;
    }
    // Add ggsave if missing
    if (!/ggsave/.test(fixed)) {
      fixed = fixed.trimEnd() + `\n\nggsave("poster_figure.png", width = 10, height = 7, dpi = 300)`;
    }
  } else {
    // Python
    if (/rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*[\d.]+/.test(fixed)) {
      fixed = fixed.replace(/(rcParams\s*\[\s*['"]font\.size['"]\s*\]\s*=\s*)[\d.]+/, `$1${suggested}`);
    } else if (/font_scale\s*=\s*[\d.]+/.test(fixed)) {
      fixed = fixed.replace(/font_scale\s*=\s*[\d.]+/, `font_scale=${(suggested / 10).toFixed(1)}`);
    } else {
      fixed = `import matplotlib.pyplot as plt\nplt.rcParams['font.size'] = ${suggested}\n\n` + fixed;
    }
    // Add savefig if missing
    if (!/savefig/.test(fixed)) {
      fixed = fixed.trimEnd() + `\n\nplt.savefig("poster_figure.png", dpi=300, bbox_inches="tight")`;
    }
  }

  return fixed;
}

export function ReadabilityPanel({ selectedBlock }: Props) {
  const [code, setCode] = useState('');
  const [lang, setLang] = useState<'auto' | 'r' | 'python'>('auto');
  const [showFullCode, setShowFullCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isImage = selectedBlock?.type === 'image';

  const detectedLang = useMemo(() => {
    if (lang !== 'auto') return lang;
    // Score-based detection — R and Python patterns both checked,
    // highest score wins. Prevents false positives when code has
    // ambiguous tokens (e.g. "plot" exists in both languages).
    let rScore = 0;
    let pyScore = 0;

    // Strong R signals
    if (/ggplot\s*\(/.test(code)) rScore += 5;
    if (/geom_\w+/.test(code)) rScore += 5;
    if (/theme_\w+/.test(code)) rScore += 4;
    if (/ggsave\s*\(/.test(code)) rScore += 5;
    if (/aes\s*\(/.test(code)) rScore += 4;
    if (/<-/.test(code)) rScore += 3;
    if (/library\s*\(/.test(code)) rScore += 3;
    if (/\b(cowplot|patchwork|ggpubr|gridExtra|lattice)\b/.test(code)) rScore += 4;
    if (/%>%|%\+%|\|>/.test(code)) rScore += 3;
    if (/\bc\s*\(/.test(code)) rScore += 1;
    if (/element_text|element_blank|element_rect/.test(code)) rScore += 4;
    if (/facet_wrap|facet_grid/.test(code)) rScore += 4;
    if (/scale_\w+/.test(code)) rScore += 2;
    if (/labs\s*\(/.test(code)) rScore += 2;

    // Strong Python signals
    if (/plt\./.test(code)) pyScore += 5;
    if (/matplotlib/.test(code)) pyScore += 5;
    if (/import\s+\w+/.test(code)) pyScore += 3;
    if (/seaborn|sns\./.test(code)) pyScore += 5;
    if (/figsize\s*=/.test(code)) pyScore += 4;
    if (/subplots\s*\(/.test(code)) pyScore += 4;
    if (/ax\.\w+/.test(code)) pyScore += 3;
    if (/rcParams/.test(code)) pyScore += 4;
    if (/set_xlabel|set_ylabel|set_title/.test(code)) pyScore += 3;
    if (/savefig\s*\(/.test(code)) pyScore += 4;
    if (/def\s+\w+|class\s+\w+/.test(code)) pyScore += 2;
    if (/fig,\s*ax/.test(code)) pyScore += 3;

    if (rScore === 0 && pyScore === 0) return null;
    if (rScore > pyScore) return 'r';
    if (pyScore > rScore) return 'python';
    return null; // tie — ask user to pick
  }, [code, lang]);

  // Use image block dimensions if available, otherwise use a standard 10×7 default
  const blockWidthIn = isImage ? selectedBlock.w / PX : 10;
  const blockHeightIn = isImage ? selectedBlock.h / PX : 7;

  const params: FigureParams | null = useMemo(() => {
    if (!code.trim() || !detectedLang) return null;
    return detectedLang === 'r' ? parseRCode(code) : parsePythonCode(code);
  }, [code, detectedLang]);

  const result: ReadabilityResult | null = useMemo(() => {
    if (!params) return null;
    return computeReadability(params, blockHeightIn, blockWidthIn);
  }, [params, blockHeightIn, blockWidthIn]);

  const fullFixedCode = useMemo(() => {
    if (!result || !params || !code.trim()) return '';
    return generateFullFix(code, params, result.suggestedBaseSize);
  }, [code, params, result]);

  return (
    <div style={panelStyle}>
      {/* Code checker — always available */}
      <div style={labelStyle}>Code Readability Check</div>
      <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
        Paste your R or Python plotting code to check if figure text will be readable at poster print size.
        {isImage
          ? ` Using selected image block (${(blockWidthIn).toFixed(1)}" × ${(blockHeightIn).toFixed(1)}").`
          : ' Select an image block for exact sizing, or using default 10" × 7".'
        }
      </p>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['auto', 'r', 'python'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              ...copyBtnStyle,
              background: lang === l ? '#45475a' : '#313244',
              fontFamily: 'system-ui',
              textTransform: 'capitalize',
            }}
          >
            {l === 'auto' ? 'Auto' : l === 'r' ? 'R' : 'Python'}
          </button>
        ))}
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="# Paste your ggplot / matplotlib code here..."
        style={textareaStyle}
      />

      {detectedLang && (
        <div style={{ fontSize: 13, color: '#89b4fa' }}>
          Detected: {detectedLang === 'r' ? 'R / ggplot2' : 'Python / matplotlib'}
        </div>
      )}

      {result && (
        <>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 13, color: '#f9e2af', display: 'flex', gap: 4 }}>
              <span>&#9888;</span> {w}
            </div>
          ))}

          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Scale factor: {result.scale.toFixed(2)}x
            {!isImage && ' (default block size)'}
          </div>

          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #45475a', color: '#9ca3af' }}>
                <th style={{ textAlign: 'left', padding: '4px 0' }}>Element</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }}>Source</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }}>Print</th>
                <th style={{ textAlign: 'right', padding: '4px 4px' }}>Min</th>
                <th style={{ textAlign: 'center', padding: '4px 0', width: 20 }}></th>
              </tr>
            </thead>
            <tbody>
              {result.elements.map((el) => (
                <tr key={el.name} style={{ borderBottom: '1px solid #313244' }}>
                  <td style={{ padding: '4px 0', color: '#cdd6f4' }}>{el.name}</td>
                  <td style={{ textAlign: 'right', padding: '4px 4px', color: '#bac2de' }}>{el.sourcePt}pt</td>
                  <td style={{
                    textAlign: 'right', padding: '4px 4px',
                    color: el.status === 'pass' ? '#a6e3a1' : el.status === 'warn' ? '#f9e2af' : '#f38ba8',
                    fontWeight: 600,
                  }}>
                    {el.effectivePt}pt
                  </td>
                  <td style={{ textAlign: 'right', padding: '4px 4px', color: '#6b7280' }}>{el.minPt}pt</td>
                  <td style={{ textAlign: 'center', padding: '4px 0' }}>
                    {el.status === 'pass' ? '✓' : el.status === 'warn' ? '⚠' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.elements.some((e) => e.status !== 'pass') && (
            <div style={{ background: '#313244', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>
                Recommended fix (base_size = {result.suggestedBaseSize}):
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <button
                  onClick={() => setShowFullCode(!showFullCode)}
                  style={{ ...copyBtnStyle, fontFamily: 'system-ui', fontSize: 13 }}
                >
                  {showFullCode ? 'Show snippet' : 'Show full code'}
                </button>
                <button
                  style={{ ...copyBtnStyle, minWidth: 60, textAlign: 'center' }}
                  onClick={() => handleCopy(showFullCode ? fullFixedCode : result.copySnippet)}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre style={{
                fontSize: 12, color: '#a6e3a1', fontFamily: 'monospace',
                background: '#1e1e2e', borderRadius: 4, padding: 8,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 200, overflow: 'auto',
                margin: 0,
              }}>
                {showFullCode ? fullFixedCode : result.copySnippet}
              </pre>
            </div>
          )}

          {result.elements.every((e) => e.status === 'pass') && (
            <div style={{ background: '#1a3a2a', borderRadius: 6, padding: 10, fontSize: 12, color: '#a6e3a1' }}>
              All elements pass readability thresholds at this poster size.
            </div>
          )}
        </>
      )}

      {/* OCR section — only when image selected */}
      {isImage && (
        <div style={{ borderTop: '1px solid #45475a', paddingTop: 12, marginTop: 4 }}>
          <div style={labelStyle}>Image OCR Analysis</div>
          <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            Scan the uploaded figure for text and check readability directly from the image — no code needed.
          </p>
          <button
            disabled
            style={{
              ...copyBtnStyle,
              marginTop: 8,
              opacity: 0.4,
              cursor: 'not-allowed',
              fontFamily: 'system-ui',
            }}
          >
            Scan Image (coming soon)
          </button>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            Phase 2 — local Ollama or Claude Vision
          </div>
        </div>
      )}
    </div>
  );
}
