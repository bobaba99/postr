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
    size: '4\' × 6\' board (48" × 72")',
    sizeNote: 'Board is 4ft high × 6ft wide — poster must fit within.',
    fonts: [
      { element: 'Title', min: '72pt', recommended: '158pt' },
      { element: 'Headings', min: '46pt', recommended: '56pt' },
      { element: 'Body', min: '24pt', recommended: '36pt' },
      { element: 'Captions', min: '18pt' },
    ],
    tips: [
      'Sans-serif font (Arial, Calibri recommended)',
      'Title readable from 10–15 feet',
      '"Better Poster" modification template available from APA',
      'Dark text on white/off-white, or white on dark — verify contrast',
    ],
    url: 'https://convention.apa.org/presenters/posters',
    urlLabel: 'APA Convention — Poster Presenters',
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
    size: '4\' × 8\' board (48" × 96")',
    sizeNote: 'Board is 4ft high × 8ft wide. Common poster sizes: 36"×48" or 24"×36".',
    fonts: [
      { element: 'Headings', min: '30pt' },
      { element: 'Body', min: '20pt' },
    ],
    tips: [
      'Content readable from 3 feet',
      'Assertion-evidence format encouraged',
      'No A/V equipment allowed at standard poster sessions',
      'Include QR code linking to your OSF/preprint',
    ],
    url: 'https://www.psychologicalscience.org/conventions/2025-aps-annual-convention/call-for-submissions/poster-rules-and-guidelines',
    urlLabel: 'APS 2025 — Poster Rules & Guidelines',
  },
  {
    conference: 'ACNP',
    field: 'Neuropsychopharmacology',
    size: '45" × 45" max (square)',
    sizeNote: 'Maximum 45×45 inches. Check yearly PDF guidelines for details.',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'Mount at eye level',
      'Include institutional logo and funding acknowledgments',
      'Download the yearly poster guidelines PDF from ACNP',
    ],
    url: 'https://acnp.org/annual-meeting/submissions/',
    urlLabel: 'ACNP — Submissions & Guidelines',
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
    size: '95 cm × 140 cm (37.4" × 55.1")',
    sizeNote: 'Portrait orientation required. ECNP handles printing for all posters.',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Headings', min: '36pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'Portrait orientation — not A0, smaller than typical US posters',
      'Casual observer should grasp the message within seconds',
      'Disclose conflicts of interest at the bottom',
      'Posters hung after 09:00 may not qualify for the ECNP Poster Award',
    ],
    url: 'https://www.ecnp.eu/congress2025/abstracts-and-posters/guidelines-for-poster-presentation/',
    urlLabel: 'ECNP 2025 — Poster Guidelines',
  },
  {
    conference: 'SPSP',
    field: 'Social/Personality Psychology',
    size: '4\' × 6\' board (48" × 72")',
    fonts: [
      { element: 'Title', min: '72pt' },
      { element: 'Body', min: '24pt' },
    ],
    tips: [
      'Do NOT use foam-core or thick heavy materials',
      'Cannot set materials on the floor or lean against the board',
      'Keep methods brief — focus on results + implications',
      'Fabric printing recommended (Spoonflower) — reusable, wrinkle-free',
    ],
    url: 'https://spsp.org/events/annual-convention',
    urlLabel: 'SPSP — Annual Convention',
  },
];

const GENERAL_RESOURCES: { name: string; url: string; description: string }[] = [
  {
    name: 'Colin Purrington — Designing Conference Posters',
    url: 'https://colinpurrington.com/tips/poster-design/',
    description: 'Title 85pt, body 32pt, captions 24pt. Target <1000 words. 45-65 chars per line.',
  },
  {
    name: 'Better Posters (Zen Faulkes)',
    url: 'https://betterposters.blogspot.com/',
    description: 'ADA accessibility: 66pt from 6ft, 120pt from 10ft. "Design with empathy."',
  },
  {
    name: 'Better Posters — Font Size Article',
    url: 'https://betterposters.substack.com/p/your-poster-text-is-too-damn-small-20-08-20',
    description: '"Your poster text is too damn small" — why 24pt body is half the ADA standard.',
  },
  {
    name: 'NYU Poster Design Tips',
    url: 'https://guides.nyu.edu/posters',
    description: 'Min 18pt any text. 300-800 words. 120+ ppi images. 1-inch margins.',
  },
  {
    name: 'UAB Poster Design — Font Size Chart',
    url: 'https://www.uab.edu/medicine/poster/create-poster/poster-design',
    description: 'Font size reference chart by poster dimension. Purrington-style specs.',
  },
];

// ── Component ────────────────────────────────────────────────────────

export function GuidelinesPanel({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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
          <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #1f1f2e' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#9ca3af' }}>
              Poster Guidelines
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>
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

            <div style={{ padding: '12px 20px 4px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#9ca3af', marginBottom: 8 }}>
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
                  <div style={{ fontSize: 13, color: '#89b4fa', fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4, marginTop: 2 }}>{r.description}</div>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e2e8' }}>{g.conference}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{g.field} — {g.size}</div>
        </div>
        <span style={{ fontSize: 12, color: '#6b7280', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
          ▸
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 20px 12px' }}>
          {g.sizeNote && (
            <div style={{ fontSize: 11, color: '#f9e2af', marginBottom: 6, lineHeight: 1.4 }}>
              Note: {g.sizeNote}
            </div>
          )}

          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {g.tips.map((tip, i) => (
              <div key={i} style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4, paddingLeft: 10, borderLeft: '2px solid #2a2a3a' }}>
                {tip}
              </div>
            ))}
          </div>

          <a
            href={g.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: '#89b4fa', textDecoration: 'none' }}
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
  width: 320,
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
