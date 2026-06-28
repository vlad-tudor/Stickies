// Shared motion tokens for the anime.js motion pass (Phase 5). Centralised so tweens
// across the app share one feel; tune here, not per-call-site.
export const MOTION = {
  ease: "outCubic",
  view: 380, // viewport pan/zoom tweens (centering, fit, reset)
  enter: 200, // element enter (create)
  leave: 160, // element leave (delete)
} as const;
