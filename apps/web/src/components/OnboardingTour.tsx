/**
 * OnboardingTour — click-through tutorial overlay for new users.
 *
 * Shows a sequence of spotlight steps highlighting key UI areas:
 * sidebar tabs, canvas editing, table controls, style presets, etc.
 * Each step highlights one element with a tooltip and a Next/Back
 * button pair. Completes on the last step or on "Skip tour".
 *
 * Stored in localStorage as `postr.onboarding-done` so it only
 * shows once per browser. Users can re-trigger from Profile page.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

interface TourStep {
  /** CSS selector for the element to highlight */
  selector: string;
  /** Fallback: highlight by sidebar tab name + click it */
  tabName?: string;
  /** Tooltip title */
  title: string;
  /** Tooltip body */
  body: string;
  /** Where to position the tooltip relative to the highlighted element */
  position: 'bottom' | 'right' | 'left' | 'top';
}

const STEPS: TourStep[] = [
  {
    selector: '[data-postr-canvas-frame]',
    title: 'Your poster canvas',
    body: 'This is where your poster lives. Click any block to select it, drag to move, and resize from the corner handle.',
    position: 'left',
  },
  {
    selector: 'button[aria-label="layout"]',
    tabName: 'layout',
    title: 'Layout tab',
    body: 'Set your poster name (for the dashboard), choose a size, pick a template, and auto-arrange blocks.',
    position: 'right',
  },
  {
    selector: 'button[aria-label="insert"]',
    tabName: 'insert',
    title: 'Insert blocks',
    body: 'Add headings, text, images, tables, and references. Each block snaps to the grid.',
    position: 'right',
  },
  {
    selector: 'button[aria-label="edit"]',
    tabName: 'edit',
    title: 'Edit selected block',
    body: 'Click a block on the canvas first, then use this tab to fine-tune it — table rows, border presets, etc.',
    position: 'right',
  },
  {
    selector: 'button[aria-label="style"]',
    tabName: 'style',
    title: 'Style & typography',
    body: 'Choose a color palette, font, and adjust sizes. Save your look as a preset to reuse across posters.',
    position: 'right',
  },
  {
    selector: 'button[aria-label="authors"]',
    tabName: 'authors',
    title: 'Authors & institutions',
    body: 'Add your co-authors and affiliations. They render automatically below the poster title.',
    position: 'right',
  },
  {
    selector: 'button[aria-label="refs"]',
    tabName: 'refs',
    title: 'References',
    body: 'Add citations manually or import a .bib file. Choose APA, Vancouver, IEEE, or Harvard style.',
    position: 'right',
  },
  {
    selector: 'button[aria-label="figure"]',
    tabName: 'figure',
    title: 'Figure readability',
    body: 'Paste your R or Python plotting code to check whether figure text will be readable at print size.',
    position: 'right',
  },
  {
    selector: 'button[title="Show poster guidelines"]',
    title: 'Conference guidelines',
    body: 'Quick reference for poster sizes and font minimums from APA, SfN, APS, ECNP, and more.',
    position: 'left',
  },
];

const STORAGE_KEY = 'postr.onboarding-done';

export function OnboardingTour() {
  const [step, setStep] = useState(-1); // -1 = not started / done
  const [rect, setRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Only show if not completed before
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Small delay so the editor finishes mounting
    const t = setTimeout(() => setStep(0), 800);
    return () => clearTimeout(t);
  }, []);

  const measureStep = useCallback((idx: number) => {
    if (idx < 0 || idx >= STEPS.length) return;
    const s = STEPS[idx]!;
    // Click the sidebar tab if specified, so the element is visible
    if (s.tabName) {
      const tabBtn = document.querySelector<HTMLElement>(
        `button[aria-label="${s.tabName}"], nav button`
      );
      // Find by matching text content
      const allBtns = document.querySelectorAll<HTMLElement>('nav[aria-label="Sidebar sections"] button');
      for (const btn of allBtns) {
        if (btn.textContent?.trim().toLowerCase() === s.tabName) {
          btn.click();
          break;
        }
      }
    }
    // Wait a tick for re-render
    requestAnimationFrame(() => {
      const el = document.querySelector(s.selector);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    });
  }, []);

  useEffect(() => {
    if (step >= 0) measureStep(step);
  }, [step, measureStep]);

  // Resize handler
  useEffect(() => {
    if (step < 0) return;
    const handler = () => measureStep(step);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [step, measureStep]);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setStep(-1);
  }, []);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      finish();
    } else {
      setStep(step + 1);
    }
  }, [step, finish]);

  const back = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  if (step < 0 || !STEPS[step]) return null;

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  // Tooltip position
  const tooltipStyle: CSSProperties = (() => {
    const base: CSSProperties = {
      position: 'fixed',
      zIndex: 10002,
      width: 300,
      background: '#111118',
      border: '1px solid #7c6aed',
      borderRadius: 10,
      padding: '16px 20px',
      boxShadow: '0 12px 40px rgba(124, 106, 237, 0.2), 0 4px 16px rgba(0,0,0,0.5)',
    };
    if (!rect) return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const gap = 12;
    if (current.position === 'right') {
      return { ...base, top: rect.top + rect.height / 2, left: rect.right + gap, transform: 'translateY(-50%)' };
    }
    if (current.position === 'left') {
      return { ...base, top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + gap, transform: 'translateY(-50%)' };
    }
    if (current.position === 'bottom') {
      return { ...base, top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    }
    // top
    return { ...base, bottom: window.innerHeight - rect.top + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
  })();

  return (
    <div ref={overlayRef}>
      {/* Dark overlay with a cutout for the highlighted element */}
      <div
        onClick={next}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.55)',
          cursor: 'pointer',
        }}
      />

      {/* Spotlight ring around the highlighted element */}
      {rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            border: '2px solid #7c6aed',
            borderRadius: 8,
            zIndex: 10001,
            pointerEvents: 'none',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55), 0 0 20px rgba(124, 106, 237, 0.4)',
          }}
        />
      )}

      {/* Tooltip */}
      <div style={tooltipStyle}>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
          Step {step + 1} of {STEPS.length}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e2e8', marginBottom: 6 }}>
          {current.title}
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5, marginBottom: 16 }}>
          {current.body}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={finish} style={skipBtnStyle}>
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {step > 0 && (
              <button onClick={back} style={navBtnStyle}>
                Back
              </button>
            )}
            <button onClick={next} style={primaryBtnStyle}>
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reset onboarding — call from Profile page. */
export function resetOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Button styles ────────────────────────────────────────────────────

const skipBtnStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  fontSize: 12,
  color: '#6b7280',
};

const navBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 500,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};

const primaryBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: '#fff',
  background: '#7c6aed',
  border: 'none',
  borderRadius: 6,
};
