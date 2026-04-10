/**
 * OnboardingTour — click-through tutorial for new users.
 *
 * Uses a non-blocking approach: NO dark overlay. Instead, a bright
 * purple border pulse highlights the target element, and a floating
 * tooltip explains it. The rest of the UI stays fully visible and
 * interactive so users can see the sidebars clearly.
 *
 * For sidebar tab steps, the tour clicks the tab to open it, then
 * highlights the entire sidebar panel so users see the content being
 * described — not just a tiny tab button.
 *
 * Stored in localStorage as `postr.onboarding-done`.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

interface TourStep {
  selector: string;
  tabName?: string;
  title: string;
  body: string;
  position: 'bottom' | 'right' | 'left' | 'top';
}

const STEPS: TourStep[] = [
  {
    selector: '[data-postr-canvas-frame]',
    title: 'Your poster canvas',
    body: 'Click any block to select it, drag to move, and resize from the corner handle.',
    position: 'left',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'layout',
    title: 'Layout tab',
    body: 'Set your poster name, choose a size, pick a template, and auto-arrange blocks.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'insert',
    title: 'Insert blocks',
    body: 'Add headings, text, images, tables, and references. Each block snaps to the grid.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'edit',
    title: 'Edit selected block',
    body: 'Click a block on the canvas first, then use this tab to fine-tune it — table rows, border presets, etc.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'style',
    title: 'Style & typography',
    body: 'Choose a color palette, font, and adjust sizes. Save your look as a preset to reuse across posters.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'authors',
    title: 'Authors & institutions',
    body: 'Add your co-authors and affiliations. They render automatically below the poster title.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'refs',
    title: 'References',
    body: 'Add citations manually or import a .bib file. Choose APA, Vancouver, IEEE, or Harvard style.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'figure',
    title: 'Figure readability',
    body: 'Paste your R or Python plotting code to check whether figure text will be readable at print size.',
    position: 'right',
  },
  {
    selector: 'button[title="Hide guidelines"]',
    title: 'Conference guidelines',
    body: 'Quick reference for poster sizes and font minimums from APA, SfN, APS, ECNP, and more.',
    position: 'left',
  },
];

const STORAGE_KEY = 'postr.onboarding-done';

export function OnboardingTour() {
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const pulseRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setStep(0), 800);
    return () => clearTimeout(t);
  }, []);

  // Inject pulse animation once
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes postr-tour-pulse {
        0%, 100% { box-shadow: 0 0 0 3px rgba(124,106,237,0.6); }
        50% { box-shadow: 0 0 0 6px rgba(124,106,237,0.3), 0 0 20px rgba(124,106,237,0.2); }
      }
    `;
    document.head.appendChild(style);
    pulseRef.current = style;
    return () => { style.remove(); };
  }, []);

  const measureStep = useCallback((idx: number) => {
    if (idx < 0 || idx >= STEPS.length) return;
    const s = STEPS[idx]!;

    // Click sidebar tab if specified
    if (s.tabName) {
      const allBtns = document.querySelectorAll<HTMLElement>('nav[aria-label="Sidebar sections"] button');
      for (const btn of allBtns) {
        if (btn.textContent?.trim().toLowerCase() === s.tabName) {
          btn.click();
          break;
        }
      }
    }

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
    if (step >= STEPS.length - 1) finish();
    else setStep(step + 1);
  }, [step, finish]);

  const back = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  if (step < 0 || !STEPS[step]) return null;

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  // Tooltip positioning
  const tooltipStyle: CSSProperties = (() => {
    const base: CSSProperties = {
      position: 'fixed',
      zIndex: 10002,
      width: 300,
      background: '#111118',
      border: '1.5px solid #7c6aed',
      borderRadius: 10,
      padding: '16px 20px',
      boxShadow: '0 12px 40px rgba(124, 106, 237, 0.25), 0 4px 16px rgba(0,0,0,0.5)',
    };
    if (!rect) return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const gap = 16;
    if (current.position === 'right') {
      return { ...base, top: Math.min(rect.top + 60, window.innerHeight - 200), left: rect.right + gap };
    }
    if (current.position === 'left') {
      return { ...base, top: Math.min(rect.top + 60, window.innerHeight - 200), right: window.innerWidth - rect.left + gap };
    }
    if (current.position === 'bottom') {
      return { ...base, top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    }
    return { ...base, bottom: window.innerHeight - rect.top + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
  })();

  return (
    <>
      {/* Pulsing highlight border around the target element — no dark overlay */}
      {rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - 3,
            left: rect.left - 3,
            width: rect.width + 6,
            height: rect.height + 6,
            border: '2.5px solid #7c6aed',
            borderRadius: 8,
            zIndex: 10001,
            pointerEvents: 'none',
            animation: 'postr-tour-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Tooltip */}
      <div style={tooltipStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e2e8' }}>
            {current.title}
          </span>
          <span style={{ fontSize: 11, color: '#7c6aed', fontWeight: 600 }}>
            {step + 1}/{STEPS.length}
          </span>
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
              <button onClick={back} style={navBtnStyle}>Back</button>
            )}
            <button onClick={next} style={primaryBtnStyle}>
              {isLast ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function resetOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const skipBtnStyle: CSSProperties = {
  all: 'unset', cursor: 'pointer', fontSize: 12, color: '#6b7280',
};
const navBtnStyle: CSSProperties = {
  cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 500,
  color: '#c8cad0', background: '#1a1a26', border: '1px solid #2a2a3a', borderRadius: 6,
};
const primaryBtnStyle: CSSProperties = {
  cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 600,
  color: '#fff', background: '#7c6aed', border: 'none', borderRadius: 6,
};
