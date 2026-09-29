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
import { usePublishFlowStore } from '@/stores/publishFlowStore';
import { GALLERY_PUBLIC_ENABLED } from '@/config/features';
import { useFeedbackStore } from '@/stores/feedbackStore';

interface TourStep {
  /**
   * What to highlight: a selector, or several in order of preference (the
   * first that matches wins), for a feature shown two ways, such as a
   * closed panel's toggle before the panel itself.
   */
  selector: string | readonly string[];
  tabName?: string;
  title: string;
  /** The text; or one per selector, for the one that matched. */
  body: string | readonly string[];
  position: 'bottom' | 'right' | 'left' | 'top';
}

// The tour shows ONLY Postr's differentiated features — anything you'd
// also get from Canva/PowerPoint/Figma (block insertion, font picker,
// general layout) is intentionally cut. Order walks the typical
// poster-building flow: import existing work → fill in metadata
// (authors / refs) → check the figures → fix issues → export.
//
// NOTE on tabName: we match against the button's visible label text
// (the sidebar's display label), NOT the internal SidebarTab key.
// When a label is renamed in Sidebar.tsx, update the `tabName` here
// or the tour silently skips clicking the tab.
const STEPS: TourStep[] = [
  {
    selector: '[data-postr-canvas-frame]',
    title: 'Your poster canvas',
    body: 'Click any block to select it, drag to move, and resize from the corner handle.',
    position: 'left',
  },
  {
    selector: '[data-postr-import-tile]',
    tabName: 'layout',
    title: 'Already have a poster? Import it',
    body: 'Drop a PDF, image, or .postr bundle. Text-layer PDFs land every paragraph AND embedded figure as editable blocks. Image-based files (flattened PDFs, JPG/PNG scans) bring in the text only — figures and tables need to be re-added with the Insert tab. The "+ New poster ▾" menu on the dashboard does the same for fresh imports.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'authors',
    title: 'Author list & institutions',
    body: 'Define institutions once, then assign each author to one or more — the byline auto-formats with superscript footnotes (¹University A · ²University B). No other poster tool gets this right.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'references',
    title: 'References with citation styles',
    body: 'Import .bib / .ris / .enw, add citations manually, or paste pre-formatted references straight from your manuscript. APA, Vancouver, IEEE, and Harvard styles render automatically.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    // Matches the rail's visible label for the `check` tab ("figure",
    // Sidebar.tsx). It read "plot code check" after that label was
    // renamed, so the tour silently skipped opening the tab.
    tabName: 'figure',
    title: 'Plot code readability check',
    body: 'Paste your R or Python plotting code to verify figure text will be legible at print size. Drag the gray rectangle on the canvas, or select an image block to lock to its exact dimensions.',
    position: 'right',
  },
  {
    selector: '[data-postr-sidebar]',
    tabName: 'issues',
    title: 'Pre-flight issues',
    body: 'Automated lint scans for blocks off-canvas, empty figures, missing authors, leftover placeholder text, and more. The red badge counts pending problems — click any issue to jump to the offending block.',
    position: 'right',
  },
  {
    selector: '[data-postr-export-postr]',
    tabName: 'export',
    title: 'Export, print, or save .postr',
    body: GALLERY_PUBLIC_ENABLED
      ? 'Save as PDF, email to any Staples kiosk, publish to the gallery — or download a lossless .postr bundle (poster JSON + every figure) you can re-import later from any browser.'
      : 'Save as PDF, email to any Staples kiosk — or download a lossless .postr bundle (poster JSON + every figure) you can re-import later from any browser.',
    position: 'right',
  },
  {
    // Below 1600 px the panel starts closed (fix 03): point at its toggle
    // then, not at the panel clipped off the edge of the window.
    selector: ['[data-postr-guidelines-toggle]', '[data-postr-guidelines]'],
    title: 'Conference guidelines',
    body: [
      'Quick reference for poster sizes and font minimums from APA, SfN, APS, ECNP, and more. Open it with this button when you need it.',
      'Quick reference for poster sizes and font minimums from APA, SfN, APS, ECNP, and more. Close it to give the canvas more room.',
    ],
    position: 'left',
  },
];

const STORAGE_KEY = 'postr.onboarding-done';

/**
 * The first element matching one of `selector`, in order of preference,
 * and which selector it was.
 */
function firstMatch(selector: TourStep['selector']): { el: HTMLElement; index: number } | null {
  const list = typeof selector === 'string' ? [selector] : selector;
  for (let index = 0; index < list.length; index += 1) {
    const el = document.querySelector<HTMLElement>(list[index]!);
    if (el) return { el, index };
  }
  return null;
}

/**
 * Bring `el` into view inside the nearest panel that scrolls vertically,
 * and only vertically. scrollIntoView would also scroll clipped boxes, such
 * as the sidebar while it slides open, and move the target away from where
 * it was measured (fix 03). A target taller than its panel (the canvas
 * when zoomed in) is left alone.
 */
function scrollIntoPanel(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    const box = p.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.height > box.height) return;
    if (r.top < box.top) p.scrollTop -= box.top - r.top;
    else if (r.bottom > box.bottom) p.scrollTop += r.bottom - box.bottom;
    return;
  }
}

/** A rect's position and size, rounded, for telling whether it moved. */
const rectKey = (r: DOMRect | null) =>
  r ? `${Math.round(r.left)} ${Math.round(r.top)} ${Math.round(r.width)} ${Math.round(r.height)}` : '';

export function OnboardingTour() {
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  /** Which of the step's selectors matched (for its text). */
  const [matched, setMatched] = useState(0);
  /**
   * The window's size when the target was last measured. The strips and the
   * tooltip are drawn from it, not from `window` at render time, so a resize
   * always redraws them (review of fix 03).
   */
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const pulseRef = useRef<HTMLStyleElement | null>(null);

  // Suspend the tour while a modal that needs full attention is open.
  // The publish flow (consent → metadata) and the feedback modal both
  // sit at z-index 9999 and the tour's transparent highlight overlay
  // would otherwise intercept clicks meant for the modal. We don't
  // advance or finish the tour — the same step resumes after the
  // modal closes.
  const publishStep = usePublishFlowStore((s) => s.step);
  const feedbackOpen = useFeedbackStore((s) => s.isOpen);
  const suspended = publishStep !== 'closed' || feedbackOpen;

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setStep(0), 800);
    return () => clearTimeout(t);
  }, []);

  // If the user navigates away mid-tour, mark as done so it doesn't
  // restart on the next poster open.
  useEffect(() => {
    return () => {
      if (step >= 0) {
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Get a step's target ready to be seen: open the sidebar if the user
  // collapsed it (a tab in a closed sidebar shows nothing), click the
  // step's sidebar tab, and, a frame later once the tab has rendered,
  // scroll the target into its panel (the export button sits below the
  // fold in a short window). Only when the step changes: a resize or a
  // modal closing never reopens a sidebar the user collapsed.
  const prepareStep = useCallback((idx: number) => {
    const s = STEPS[idx];
    if (!s) return;
    if (s.tabName) {
      document.querySelector<HTMLElement>('[data-postr-sidebar-reveal]')?.click();
      const allBtns = document.querySelectorAll<HTMLElement>('nav[aria-label="Sidebar sections"] button');
      for (const btn of allBtns) {
        // The label is the button's first text: the Issues tab also holds
        // a count badge, so its whole text reads "issues2" (review of fix 03).
        if (btn.firstChild?.textContent?.trim().toLowerCase() === s.tabName) {
          btn.click();
          break;
        }
      }
    }
    requestAnimationFrame(() => {
      const hit = firstMatch(s.selector);
      if (hit) scrollIntoPanel(hit.el);
    });
  }, []);

  // Earlier versions also boosted the target element's z-index to
  // 10001 so it sat above the dim overlay. That's no longer needed
  // — the 4-rect cutout already excludes the target area, so the
  // target shows through naturally at its native stacking. Boosting
  // had a side effect of yanking the target above its siblings,
  // which broke layouts (e.g. the sidebar floating above the
  // canvas during the sidebar steps) and made the pulse border
  // appear to share a stacking layer with the highlighted element.
  // Removing the boost fixes both visual artifacts.
  // Once per step: not again when a modal closes and the tour resumes,
  // which would reopen a sidebar the user collapsed (review of fix 03).
  const preparedStepRef = useRef(-1);
  useEffect(() => {
    if (step < 0) preparedStepRef.current = -1;
    if (step < 0 || suspended || preparedStepRef.current === step) return;
    preparedStepRef.current = step;
    prepareStep(step);
  }, [step, prepareStep, suspended]);

  // Follow the target every frame while a step is shown: it moves when a
  // panel opens or closes under it (the last step's toggle gives way to
  // the panel it opens), when the sidebar slides, and when the window
  // resizes. Measuring only on step changes left the highlight behind.
  useEffect(() => {
    const s = step >= 0 && !suspended ? STEPS[step] : undefined;
    if (!s) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last: string | null = null;
    const track = () => {
      const hit = firstMatch(s.selector);
      const r = hit ? hit.el.getBoundingClientRect() : null;
      // The window's size too: the dimming strips span the window, so a
      // resize that leaves the target in place must still redraw them.
      const key = `${rectKey(r)} ${window.innerWidth} ${window.innerHeight}`;
      if (key !== last) {
        last = key;
        setRect(r);
        setMatched(hit ? hit.index : 0);
        setWin({ w: window.innerWidth, h: window.innerHeight });
      }
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [step, suspended]);

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
  if (suspended) return null;

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
      return { ...base, top: Math.min(rect.top + 60, win.h - 200), left: rect.right + gap };
    }
    if (current.position === 'left') {
      return { ...base, top: Math.min(rect.top + 60, win.h - 200), right: win.w - rect.left + gap };
    }
    if (current.position === 'bottom') {
      return { ...base, top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    }
    return { ...base, bottom: win.h - rect.top + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
  })();

  // Build 4 overlay rects that darken everything EXCEPT the target
  const pad = 6;
  // Clamped to the window on every side, so no strip gets a negative
  // size: the browser drops a negative width or height and keeps the
  // previous step's strip, over the highlight.
  const sr = rect ? (() => {
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
    const top = clamp(rect.top - pad, win.h);
    const left = clamp(rect.left - pad, win.w);
    const bottom = Math.max(top, clamp(rect.bottom + pad, win.h));
    const right = Math.max(left, clamp(rect.right + pad, win.w));
    return { top, left, width: right - left, height: bottom - top };
  })() : null;
  const overlayColor = 'rgba(0, 0, 0, 0.5)';
  const vw = win.w;
  const vh = win.h;

  return (
    <>
      {/* 4-rect overlay: darkens everything except the highlighted element */}
      {sr && (
        <>
          {/* Top */}
          <div style={{ position: 'fixed', top: 0, left: 0, width: vw, height: sr.top, background: overlayColor, zIndex: 10000, pointerEvents: 'none' }} />
          {/* Bottom */}
          <div style={{ position: 'fixed', top: sr.top + sr.height, left: 0, width: vw, height: vh - sr.top - sr.height, background: overlayColor, zIndex: 10000, pointerEvents: 'none' }} />
          {/* Left */}
          <div style={{ position: 'fixed', top: sr.top, left: 0, width: sr.left, height: sr.height, background: overlayColor, zIndex: 10000, pointerEvents: 'none' }} />
          {/* Right */}
          <div style={{ position: 'fixed', top: sr.top, left: sr.left + sr.width, width: vw - sr.left - sr.width, height: sr.height, background: overlayColor, zIndex: 10000, pointerEvents: 'none' }} />
        </>
      )}

      {/* Pulsing highlight border around the target element */}
      {rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
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
          <span style={{ fontSize: 13, color: '#7c6aed', fontWeight: 600 }}>
            {step + 1}/{STEPS.length}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5, marginBottom: 16 }}>
          {typeof current.body === 'string' ? current.body : current.body[matched] ?? current.body[0]}
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
  all: 'unset', cursor: 'pointer', fontSize: 13, color: '#6b7280',
};
const navBtnStyle: CSSProperties = {
  cursor: 'pointer', padding: '6px 14px', fontSize: 13, fontWeight: 500,
  color: '#c8cad0', background: '#1a1a26', border: '1px solid #2a2a3a', borderRadius: 6,
};
const primaryBtnStyle: CSSProperties = {
  cursor: 'pointer', padding: '6px 14px', fontSize: 13, fontWeight: 600,
  color: '#fff', background: '#7c6aed', border: 'none', borderRadius: 6,
};
