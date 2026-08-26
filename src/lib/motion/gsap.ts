import { gsap } from 'gsap'

/**
 * The one place GSAP is imported from. Only Activity (MyOrders.tsx) and
 * Post Request pull this in - both are already route-level lazy chunks
 * (see App.tsx), so GSAP never reaches the main entry bundle or routes
 * that don't animate with it (Login, Home, Profile, Chat).
 *
 * Durations and eases mirror index.css's duration/ease custom-property
 * tokens exactly (in seconds, since GSAP doesn't consume CSS custom
 * properties). Keep these two files in sync rather than inventing new
 * values here.
 */
export const DURATION = {
  instant: 0.08,
  fast: 0.16,
  base: 0.24,
  slow: 0.4,
  deliberate: 0.7,
} as const

export const EASE = {
  // --ease-out: cubic-bezier(0.2, 0, 0, 1) - closest stock GSAP equivalent
  // without pulling in the CustomEase plugin for one extra decimal of fit.
  out: 'power2.out',
  // --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1) - fast start, long
  // smooth settle, no overshoot.
  emphasized: 'expo.out',
} as const

/** Paper physics: things slide, stack, settle - nothing bounces or glows. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * Every signature-moment timeline in this app should be built through
 * this, not raw gsap.timeline(). It returns the timeline alongside a
 * `dur()` resolver - GSAP applies a tween's own `duration` before any
 * timeline `defaults`, so passing DURATION.* straight into a `.fromTo()`
 * call would silently defeat reduced-motion (that was a real bug here:
 * every tween hardcoded its duration, so the reduced-motion defaults
 * below never once applied). Wrap every duration through `dur()` instead
 * of using DURATION.* directly in a tween call.
 */
export function createTimeline(): { tl: gsap.core.Timeline; dur: (seconds: number) => number } {
  const reduced = prefersReducedMotion()
  return {
    tl: gsap.timeline(),
    dur: (seconds: number) => (reduced ? 0.01 : seconds),
  }
}

export { gsap }
