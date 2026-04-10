import { useState, useMemo, type CSSProperties } from 'react';
import type { Block } from '@postr/shared';
import { PX } from './constants';
import {
  parseRCode,
  parsePythonCode,
  computeReadability,
  type ReadabilityResult,
} from './readability';

interface Props {
  selectedBlock: Block | null;
}

const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12,
};
const textareaStyle: CSSProperties = {
  width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 11,
  background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a',
  borderRadius: 4, padding: 8, resize: 'vertical',
};
const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const,
  letterSpacing: 1,
};
const copyBtnStyle: CSSProperties = {
  cursor: 'pointer', background: '#313244', color: '#cdd6f4',
  border: '1px solid #45475a', borderRadius: 4, padding: '4px 10px',
  fontSize: 11, fontFamily: 'monospace',
};

export function ReadabilityPanel({ selectedBlock }: Props) {
  const [code, setCode] = useState('');
  const [lang, setLang] = useState<'auto' | 'r' | 'python'>('auto');

  const detectedLang = useMemo(() => {
    if (lang !== 'auto') return lang;
    if (/ggplot|geom_|theme_|ggsave|aes\s*\(/.test(code)) return 'r';
    if (/plt\.|matplotlib|seaborn|sns\.|figsize|subplots/.test(code)) return 'python';
    return null;
  }, [code, lang]);

  const result: ReadabilityResult | null = useMemo(() => {
    if (!code.trim() || !detectedLang || !selectedBlock) return null;
    const params = detectedLang === 'r' ? parseRCode(code) : parsePythonCode(code);
    const blockWidthIn = selectedBlock.w / PX;
    const blockHeightIn = selectedBlock.h / PX;
    return computeReadability(params, blockHeightIn, blockWidthIn);
  }, [code, detectedLang, selectedBlock]);

  if (!selectedBlock || selectedBlock.type !== 'image') {
    return (
      <div style={panelStyle}>
        <div style={labelStyle}>Figure Readability</div>
        <p style={{ color: '#6b7280', fontSize: 11 }}>
          Select an image block on the canvas, then paste your R or Python
          plotting code here to check whether text in your figure will be
          readable at print size.
        </p>
      </div>
    );
  }

  const blockWidthIn = (selectedBlock.w / PX).toFixed(1);
  const blockHeightIn = (selectedBlock.h / PX).toFixed(1);

  return (
    <div style={panelStyle}>
      <div style={labelStyle}>Figure Readability</div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>
        Block: {blockWidthIn}" x {blockHeightIn}"
      </div>

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
        placeholder="Paste your R or Python plotting code here..."
        style={textareaStyle}
      />

      {detectedLang && (
        <div style={{ fontSize: 10, color: '#89b4fa' }}>
          Detected: {detectedLang === 'r' ? 'R / ggplot2' : 'Python / matplotlib'}
        </div>
      )}

      {result && (
        <>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: '#f9e2af', display: 'flex', gap: 4 }}>
              <span>&#9888;</span> {w}
            </div>
          ))}

          <div style={{ fontSize: 10, color: '#6b7280' }}>
            Scale factor: {result.scale.toFixed(2)}x
          </div>

          <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #45475a', color: '#9ca3af' }}>
                <th style={{ textAlign: 'left', padding: '3px 0' }}>Element</th>
                <th style={{ textAlign: 'right', padding: '3px 4px' }}>Source</th>
                <th style={{ textAlign: 'right', padding: '3px 4px' }}>Print</th>
                <th style={{ textAlign: 'right', padding: '3px 4px' }}>Min</th>
                <th style={{ textAlign: 'center', padding: '3px 0', width: 20 }}></th>
              </tr>
            </thead>
            <tbody>
              {result.elements.map((el) => (
                <tr key={el.name} style={{ borderBottom: '1px solid #313244' }}>
                  <td style={{ padding: '3px 0', color: '#cdd6f4' }}>{el.name}</td>
                  <td style={{ textAlign: 'right', padding: '3px 4px', color: '#bac2de' }}>{el.sourcePt}pt</td>
                  <td style={{
                    textAlign: 'right', padding: '3px 4px',
                    color: el.status === 'pass' ? '#a6e3a1' : el.status === 'warn' ? '#f9e2af' : '#f38ba8',
                    fontWeight: 600,
                  }}>
                    {el.effectivePt}pt
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280' }}>{el.minPt}pt</td>
                  <td style={{ textAlign: 'center', padding: '3px 0' }}>
                    {el.status === 'pass' ? '✓' : el.status === 'warn' ? '⚠' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.elements.some((e) => e.status !== 'pass') && (
            <div style={{ background: '#313244', borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>
                Suggested minimum:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ flex: 1, fontSize: 11, color: '#a6e3a1', fontFamily: 'monospace' }}>
                  {result.copySnippet}
                </code>
                <button
                  style={copyBtnStyle}
                  onClick={() => navigator.clipboard.writeText(result.copySnippet)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
