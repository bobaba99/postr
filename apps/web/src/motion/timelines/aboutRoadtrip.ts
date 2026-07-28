/**
 * aboutRoadtrip — scroll reveals for the About page's vertical
 * "roadtrip" timeline.
 *
 * Same SEO contract as landingEntrance: every initial state is set by
 * `gsap.set()` at runtime, never in CSS, so the prerendered markup is
 * fully readable if GSAP never runs.
 *
 * The design intent: the page is a road you travel down. Cards
 * arriving from their own side of the road is the one directional
 * effect on these pages that carries meaning rather than decoration —
 * a left card sliding in from the left is the reader moving past it.
 * Waypoint markers pop as you reach them, which is what makes the
 * numbered stops feel like stops.
 */
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsap, canAnimate, HOUSE_OUT, HOUSE_BACK, CSS_DURATION } from '..';

gsap.registerPlugin(ScrollTrigger);

/**
 * Horizontal travel for an alternating card, in px.
 *
 * 24px — larger than the landing page's 12px vertical rise because
 * horizontal movement across a wide gutter reads as smaller than the
 * same distance vertically, and because here the direction is the
 * message. Still nowhere near far enough to risk overflowing the
 * viewport mid-tween on the card's own side.
 */
const SLIDE = 24;

/**
 * One trigger per row rather than a batch.
 *
 * The opposite call from the landing page's card grid, for a concrete
 * reason: these rows are full-width and alternate sides, so no two
 * ever enter the viewport "together" in a way worth grouping. Each
 * row is its own beat, and each needs its own direction — which a
 * batch's shared callback cannot express.
 */
function revealRows(scope: Element): void {
  const rows = Array.from(scope.querySelectorAll('[data-postr-milestone]'));

  rows.forEach((row) => {
    const card = row.querySelector('[data-postr-milestone-card]');
    const marker = row.querySelector('[data-postr-milestone-marker]');
    // `left` | `right` — set by the component so the motion follows
    // the layout rather than re-deriving the alternation here.
    const side = row.getAttribute('data-postr-milestone') === 'left' ? -1 : 1;

    if (card) gsap.set(card, { opacity: 0, x: SLIDE * side });
    if (marker) gsap.set(marker, { opacity: 0, scale: 0.9 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: row,
        start: 'top 80%',
        once: true,
      },
      defaults: { duration: CSS_DURATION.slow, ease: HOUSE_OUT },
    });

    /*
      fromTo rather than to: the tween then owns both ends of the
      range, so a revert or a killed trigger restores the card instead
      of stranding it at opacity 0. clearProps hands the resting state
      back to CSS so eight cards do not each keep an inline transform
      for the life of the page.
    */
    // Marker first, card second: you arrive at the waypoint, then read
    // it. Reversing this reads as the card dragging the marker along.
    if (marker) {
      tl.fromTo(
        marker,
        { opacity: 0, scale: 0.9 },
        {
          opacity: 1,
          scale: 1,
          duration: CSS_DURATION.base,
          // The one overshoot on the page. A waypoint is a discrete
          // arrival — the tiny pop is what distinguishes "I reached a
          // stop" from "some content faded in". scale never goes below
          // 0.9, per the house floor.
          ease: HOUSE_BACK,
          clearProps: 'transform,opacity',
        },
      );
    }
    if (card) {
      tl.fromTo(
        card,
        { opacity: 0, x: SLIDE * side },
        { opacity: 1, x: 0, clearProps: 'transform,opacity' },
        marker ? '<0.05' : 0,
      );
    }
  });
}

/**
 * The sun/horizon mark above the road, and the mountain silhouette
 * below it — a plain fade, no movement.
 *
 * These are decorative SVG bookends. Giving them their own directional
 * motion would be a third competing effect on a page that already has
 * two; a fade is enough to stop them being simply present from the
 * first frame.
 */
function revealScenery(scope: Element): void {
  const scenery = Array.from(scope.querySelectorAll('[data-postr-scenery]'));
  if (scenery.length === 0) return;

  gsap.set(scenery, { opacity: 0 });

  scenery.forEach((el) => {
    gsap.to(el, {
      // Not opacity: 1 — the mountain and sun are drawn at reduced
      // opacity by design (0.4 / decorative). Their own CSS owns the
      // resting value, so we clear the inline override instead of
      // asserting a number here and flattening the art.
      clearProps: 'opacity',
      duration: CSS_DURATION.slow,
      ease: HOUSE_OUT,
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
}

/**
 * Wires the page up behind matchMedia; caller reverts on unmount.
 *
 * Unlike the landing page, the mobile branch KEEPS the reveals. On
 * About the timeline IS the page — a phone user scrolling eight
 * milestones with nothing happening loses the roadtrip conceit
 * entirely. What mobile drops is the horizontal slide (the cards are
 * full-width single-column there, so there is no "side" to come from,
 * and any x-travel risks horizontal overflow); it fades and rises
 * instead.
 */
export function aboutRoadtrip(scope: Element): gsap.MatchMedia {
  const mm = gsap.matchMedia();

  mm.add(
    {
      motionOk: '(prefers-reduced-motion: no-preference)',
      isDesktop: '(min-width: 640px) and (prefers-reduced-motion: no-preference)',
    },
    (ctx) => {
      const { motionOk, isDesktop } = ctx.conditions as {
        motionOk: boolean;
        isDesktop: boolean;
      };
      // See landingEntrance: a hidden tab means rAF never fires, so
      // hiding these cards would strand them — and `once: true` means
      // they would never recover.
      if (!motionOk || !canAnimate()) return;

      if (isDesktop) {
        revealRows(scope);
      } else {
        revealRowsMobile(scope);
      }
      revealScenery(scope);
    },
  );

  return mm;
}

/**
 * Mobile variant: vertical rise, no horizontal travel.
 *
 * Kept as its own function rather than a branch inside revealRows
 * because the two differ in the property animated, not just a
 * magnitude — folding them together would mean a conditional on every
 * tween and a `side` that means nothing in one of the two cases.
 */
function revealRowsMobile(scope: Element): void {
  const rows = Array.from(scope.querySelectorAll('[data-postr-milestone]'));

  rows.forEach((row) => {
    // The mobile card is the `sm:hidden` copy, which is deliberately
    // NOT marked `data-postr-milestone-card` — that attribute exists
    // to keep the desktop selector from matching both copies. Here we
    // want the other one, so we animate the wrapper the breakpoint
    // actually shows.
    const card = row.querySelector(':scope > .sm\\:hidden');
    if (!card) return;

    gsap.set(card, { opacity: 0, y: 12 });
    gsap.fromTo(
      card,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: CSS_DURATION.slow,
        ease: HOUSE_OUT,
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: row, start: 'top 85%', once: true },
      },
    );
  });
}
