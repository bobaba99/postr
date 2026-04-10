/**
 * GuidelinesPanel — right-side reference sidebar with conference poster
 * guidelines. Sits opposite the editing sidebar so both can be open
 * simultaneously without overlap.
 *
 * Data sourced from official conference websites (links provided inline).
 * The panel is collapsible via a bookmark-style toggle on the right edge.
 */
import { useState, type CSSProperties } from 'react';

// ── Guidelines Data ──────────────────────────────────────────────────

interface Guideline {
  conference: string;
  field: string;
  size: string;
  sizeNote?: string;
  fonts: FontSpec[];
  tips: string[];
  url: string;
  urlLabel: string;
}

interface FontSpec {
  element: string;
  min: string;
  recommended?: string;
}

const GUIDELINES: Guideline[] = [
  {
    conference: 'APA',
    field: 'Psychology',
    size: '48" × 36" landscape',
    fonts: [
      { element: 'Title', min: '72pt', recommended: '85–100pt' },
      { element: 'Headings', min: '36pt', recommended: '42–56pt' },
      { element: 'Body', min: '24pt', recommended: '28–36pt' },
      { element: 'Captions', min: '18pt', recommended: '20–24pt' },
    ],
    tips: [
      'Use a sans-serif font (Arial, Helvetica, or Calibri)',
      'Limit text to ~800 words total',
      'Include a clear "take-home message" section',
    ],
    url: 'https://convention.apa.org/poster-sessions',
    urlLabel: 'APA Convention — Poster Sessions',
  },
  {
    conference: 'SfN',
    field: 'Neuroscience',
    size: '72" × 48" (6\' × 4\') landscape',
    sizeNote: 'Board is 8\'×4\' — poster must fit within. Check your year\'s guidelines.',
    fonts: [
      { element: 'Title', min: '72pt', recommended: '85pt+' },
      { element: 'Headings', min: '36pt', recommended: '48pt' },
      { element: 'Body', min: '24pt', recommended: '28–32pt' },
      { element: 'Captions', min: '18pt' },
    ],
    tips: [
      'Readable from 4–6 feet away',
      'Sans-serif strongly preferred',
      'Figures should dominate — minimize text',
      'Number your poster with your assigned board number',
    ],
    url: 'https://neuronline.sfn.org/professional-development/how-to-make-and-present-a-poster-for-neuroscience-2025',
    urlLabel: 'SfN Neuronline — How to Make a Poster (2025)',
  },
  {
    conference: 'APS',
    field: 'Psychological Science',
    size: '48" × 36" landscape',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Headings', min: '36pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'Assertion-evidence format encouraged (big claim + supporting figure)',
      'Avoid walls of text — use bullet points',
      'Include QR code linking to your OSF/preprint',
    ],
    url: 'https://www.psychologicalscience.org/conventions/poster-sessions',
    urlLabel: 'APS — Poster Sessions',
  },
  {
    conference: 'ACNP',
    field: 'Neuropsychopharmacology',
    size: '4\' × 6\' landscape',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'Horizontal (landscape) orientation required',
      'Include institutional logo and funding acknowledgments',
    ],
    url: 'https://acnp.org/annual-meeting/',
    urlLabel: 'ACNP — Annual Meeting',
  },
  {
    conference: 'SOBP',
    field: 'Biological Psychiatry',
    size: '45" × 45" or 48" × 36"',
    sizeNote: 'Check acceptance letter — varies by session',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'Square format increasingly common',
      'Data-forward: figures > text',
    ],
    url: 'https://sobp.org/meetings/',
    urlLabel: 'SOBP — Meetings',
  },
  {
    conference: 'ECNP',
    field: 'European Neuropsychopharmacology',
    size: 'A0 portrait (33.1" × 46.8")',
    sizeNote: 'Portrait (vertical) orientation standard in Europe',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Headings', min: '36pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'European conferences strongly prefer portrait/vertical',
      'A0 is the de facto standard across EU conferences',
      'Include ORCID and email on the poster',
    ],
    url: 'https://www.ecnp.eu/congress',
    urlLabel: 'ECNP — Congress',
  },
  {
    conference: 'SPSP',
    field: 'Social/Personality Psychology',
    size: '48" × 36" landscape',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'Keep methods brief — focus on results + implications',
      'Transparent reporting: pre-registration links, effect sizes, CIs',
    ],
    url: 'https://spsp.org/events/annual-convention',
    urlLabel: 'SPSP — Annual Convention',
  },
];

const GENERAL_RESOURCES: { name: string; url: string; description: string }[] = [
  {
    name: 'Colin Purrington — Designing Conference Posters',
    url: 'https://colinpurrington.com/tips/poster-design/',
    description: 'Comprehensive guide with font sizes, layout templates, color choices, and printing tips.',
  },
  {
    name: 'Better Posters (Zen Faulkes)',
    url: 'https://betterposters.blogspot.com/',
    description: 'Blog reviewing real conference posters with actionable critiques.',
  },
  {
    name: 'NYU Poster Design Tips',
    url: 'https://guides.nyu.edu/posters',
    description: 'University guide with readability standards and color accessibility.',
  },
  {
    name: 'Schimel 2012 — "Writing Science"',
    url: 'https://global.oup.com/academic/product/writing-science-9780199760244',
    description: 'Ch. 28 covers poster design as storytelling.',
  },
];

// ── Component ────────────────────────────────────────────────────────

export function GuidelinesPanel() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      {/* Toggle tab — always visible on the right edge */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Hide guidelines' : 'Show poster guidelines'}
        style={toggleStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#7c6aed';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = open ? '#1e1e2e' : '#1a1a26';
          e.currentTarget.style.color = '#9ca3af';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #1f1f2e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#9ca3af' }}>
              Poster Guidelines
            </div>
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>
              Official requirements from major conferences. Click to expand.
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
            {GUIDELINES.map((g) => (
              <ConferenceCard
                key={g.conference}
                guideline={g}
                expanded={expanded === g.conference}
                onToggle={() => setExpanded(expanded === g.conference ? null : g.conference)}
              />
            ))}

            <div style={{ padding: '12px 16px 4px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#9ca3af', marginBottom: 8 }}>
                General Resources
              </div>
              {GENERAL_RESOURCES.map((r) => (
                <a
                  key={r.name}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={resourceLinkStyle}
                >
                  <div style={{ fontSize: 11, color: '#89b4fa', fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.3, marginTop: 2 }}>{r.description}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function ConferenceCard({ guideline: g, expanded, onToggle }: {
  guideline: Guideline;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ borderBottom: '1px solid #1a1a26' }}>
      <button
        onClick={onToggle}
        style={cardHeaderStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a26'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e2e8' }}>{g.conference}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>{g.field} — {g.size}</div>
        </div>
        <span style={{ fontSize: 10, color: '#6b7280', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
          ▸
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 12px' }}>
          {g.sizeNote && (
            <div style={{ fontSize: 9, color: '#f9e2af', marginBottom: 6 }}>
              Note: {g.sizeNote}
            </div>
          )}

          <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a3a' }}>
                <th style={thStyle}>Element</th>
                <th style={thStyle}>Min</th>
                <th style={thStyle}>Ideal</th>
              </tr>
            </thead>
            <tbody>
              {g.fonts.map((f) => (
                <tr key={f.element} style={{ borderBottom: '1px solid #1a1a26' }}>
                  <td style={tdStyle}>{f.element}</td>
                  <td style={{ ...tdStyle, color: '#a6e3a1', fontWeight: 600 }}>{f.min}</td>
                  <td style={{ ...tdStyle, color: '#89b4fa' }}>{f.recommended ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
            {g.tips.map((tip, i) => (
              <div key={i} style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1.3, paddingLeft: 8, borderLeft: '2px solid #2a2a3a' }}>
                {tip}
              </div>
            ))}
          </div>

          <a
            href={g.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 9, color: '#89b4fa', textDecoration: 'none' }}
          >
            {g.urlLabel} ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const toggleStyle: CSSProperties = {
  all: 'unset',
  position: 'fixed',
  top: 16,
  right: 16,
  width: 32,
  height: 32,
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#9ca3af',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  zIndex: 30,
  transition: 'background 0.15s, color 0.15s',
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: 280,
  height: '100vh',
  background: '#111118',
  borderLeft: '1px solid #1f1f2e',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 25,
  boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
};

const cardHeaderStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '10px 16px',
  boxSizing: 'border-box',
  transition: 'background 0.1s',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '3px 0',
  color: '#6b7280',
  fontWeight: 500,
};

const tdStyle: CSSProperties = {
  padding: '3px 0',
  color: '#c8cad0',
};

const resourceLinkStyle: CSSProperties = {
  display: 'block',
  textDecoration: 'none',
  padding: '8px 10px',
  borderRadius: 6,
  marginBottom: 4,
  background: '#1a1a26',
  border: '1px solid #1f1f2e',
};
