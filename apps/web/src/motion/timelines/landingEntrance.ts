/**
 * landingEntrance — the marketing hero's arrival, plus scroll-revealed
 * feature cards.
 *
 * SEO CONTRACT (the reason this file is shaped the way it is):
 * the landing page is prerendered and must be readable with JS off.
 * So nothing here starts hidden in CSS. Every initial state is written
 * by `gsap.set()` at runtime, immediately before the tween that undoes
 * it. If GSAP never runs — crawler, JS disabled, script error — the
 * markup renders in its final, fully visible state and the page is
 * simply static. The failure mode of "animate from opacity 0" is a
 * blank page for the crawler; this inverts that.
 *
 * Everything is gated behind gsap.matchMedia() so reduced-motion
 * users get the content with no movement at all, and phones skip the
 * scroll work entirely.
 */
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsap, canAnimate, HOUSE_OUT, CSS_DURATION, REVEAL_STAGGER } from '..';

gsap.registerPlugin(ScrollTrigger);

/**
 * Distance elements travel on entrance, in px.
 *
 * Deliberately small. The house standard is that entrances read as
 * "settling into place", not "flying in" — at 12px the movement is
 * felt more than seen, which is the point. It also keeps the travel
 * well under the element's own height, so nothing appears to cross
 * over its neighbour on the way in.
 */
const RISE = 12;

/**
 * Hero entrance: badge, headline, subhead, CTAs.
 *
 * A timeline rather than four delayed tweens so the sequence can be
 * retimed from one place, and so the whole thing reverts as a unit
 * when matchMedia tears it down.
 *
 * Note what is NOT here: the rotating-word slot. It owns its own CSS
 * cube animation and starts on mount. Animating its container's
 * opacity underneath it would double up two motion systems on one
 * element for no gain.
 */
function heroEntrance(scope: Element): gsap.core.Timeline {
  const targets = Array.from(
    scope.querySelectorAll('[data-postr-hero-item]'),
  );
  if (targets.length === 0) return gsap.timeline();

  const tl = gsap.timeline({
    defaults: { duration: CSS_DURATION.slow, ease: HOUSE_OUT },
  });

  /*
    gsap.from(), NOT gsap.set() + gsap.to().

    Both produce the same visual, but only from() records the start
    state as part of the tween. That matters for cleanup: matchMedia's
    revert() (and React Strict Mode's double-mount, which fires it) can
    undo a tween's own from-state, but a standalone set() is just an
    inline style write with nothing to roll back to — so the revert
    killed the tween and left `opacity: 0` painted on the hero. Content
    invisible, which on a prerendered marketing page is the exact
    failure this file is written to prevent. Verified in-browser.
  */
  tl.from(targets, {
    opacity: 0,
    y: RISE,
    stagger: REVEAL_STAGGER,
    // Nudged off zero so the first paint lands before motion starts —
    // the headline is the LCP element and should be painted, not
    // mid-tween, when the browser measures it.
    delay: 0.05,
  });

  return tl;
}

/**
 * Feature + tool cards: a staggered reveal as each grid scrolls in.
 *
 * ScrollTrigger.batch rather than one trigger per card: the cards sit
 * in rows, so what should stagger is "everything that entered the
 * viewport together", which is exactly what batch collects. One
 * trigger each would fire them independently and lose the row rhythm.
 *
 * `once: true` — these are decorative entrances. Replaying them every
 * time the user scrolls back up turns a polish detail into a
 * distraction on a page people scroll up and down while reading.
 */
function cardReveals(scope: Element): ScrollTrigger[] {
  const cards = Array.from(scope.querySelectorAll('[data-postr-reveal]'));
  if (cards.length === 0) return [];

  /*
    A card below the fold has to be hidden BEFORE its trigger fires,
    so unlike the hero this genuinely needs a standalone set(). The
    safety that from() gave us there is provided here by `once: true`
    plus the revert() in the caller — but to be certain a killed batch
    can never strand a card invisible, the reveal below uses from()
    semantics via fromTo, so the tween owns both ends of the range.
  */
  gsap.set(cards, { opacity: 0, y: RISE });

  return ScrollTrigger.batch(cards, {
    // 85% rather than the default "top bottom": the reveal should be
    // finished by the time the card is comfortably in view, not
    // starting as its first pixel clears the fold.
    start: 'top 85%',
    once: true,
    onEnter: (batch) =>
      gsap.fromTo(
        batch,
        { opacity: 0, y: RISE },
        {
          opacity: 1,
          y: 0,
          duration: CSS_DURATION.slow,
          ease: HOUSE_OUT,
          stagger: REVEAL_STAGGER,
          overwrite: true,
          // Hand the resting state back to CSS once the reveal is
          // done, so no inline transform lingers on eight cards for
          // the life of the page.
          clearProps: 'transform,opacity',
        },
      ),
  });
}

/**
 * Wires the whole page up behind matchMedia and returns the instance
 * so the caller can revert it on unmount.
 *
 * Three branches, one decision each:
 *  - reduced motion: nothing moves, nothing is hidden. We do not even
 *    set an initial state, so the page is simply static. This is the
 *    accessible default, not a degraded one.
 *  - phone: hero entrance only. Scroll-linked work is dropped rather
 *    than shrunk — on a low-end phone the win from a card fade does
 *    not pay for per-scroll callbacks, and the cards are one per row
 *    there anyway, so there is no row rhythm left to express.
 *  - desktop: the full thing.
 */
export function landingEntrance(scope: Element): gsap.MatchMedia {
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
      // Two independent reasons to leave the page static: the user
      // asked for reduced motion, or the tab is hidden so the tween
      // would never advance past its hidden first frame.
      if (!motionOk || !canAnimate()) return;

      heroEntrance(scope);
      if (isDesktop) cardReveals(scope);
    },
  );

  return mm;
}
