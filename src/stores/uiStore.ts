import { createSignal } from "solid-js";
import { raiseSticky } from "./stickyStore";
import {
  remoteHoldOn,
  holdSticky,
  releaseHold,
  HoldKind,
} from "./board/presence";

// The single sticky currently being edited (its id), or null. Global so only
// one editor/toolbar can exist at a time — independent of focus/blur, which is
// unreliable because our drag handles call preventDefault.
export const [editingStickyId, setEditingStickyId] = createSignal<string | null>(null);

// The sticky currently SELECTED on this device (drives the resize affordances
// and active styling), or null. Strictly per-client UI state — selection must
// NOT be derived from z-order, which is shared document state: a peer raising
// a note would steal everyone's selection indicator.
export const [selectedStickyId, setSelectedStickyId] = createSignal<string | null>(null);

export const clearStickySelection = (): void => {
  setSelectedStickyId(null);
};

// in-progress thread drag: source sticky id + current cursor in WORLD coords,
// or null when not connecting. Drives the live "rubber-band" line.
export const [pendingThread, setPendingThread] = createSignal<
  { from: string; to: { x: number; y: number } } | null
>(null);

// selected thread (for the delete popover): its board + id + the SCREEN point
// where it was clicked (the popover anchors there), or null.
export const [selectedThread, setSelectedThread] = createSignal<
  { boardId: string; id: string; x: number; y: number } | null
>(null);

// True while ANY drag/resize/pan is in progress (a counter, so overlapping
// gestures balance). Screen-derived overlays (off-screen markers, thread clipping)
// go cheap while this is true and do their full pass once on settle — keeps drags
// smooth, especially with a board cross-viewed in several panes.
const [interactionCount, setInteractionCount] = createSignal(0);
export const isInteracting = () => interactionCount() > 0;
export const beginInteraction = () => setInteractionCount((n) => n + 1);
export const endInteraction = () => setInteractionCount((n) => Math.max(0, n - 1));

// ── Interaction intents (the only places that mutate selection/edit state) ──

// Select on press: raise to the top and close any OTHER editor — but don't open
// this one. Cheap (no editor mount / focus), so it's safe on every pointerdown
// incl. the first finger of a pinch and the start of a drag.
export function selectSticky(boardId: string, id: string): void {
  if (editingStickyId() !== id) setEditingStickyId(null);
  setSelectedThread(null); // interacting with a note dismisses the thread popover
  setSelectedStickyId(id);
  raiseSticky(boardId, id);
}

// Enter edit: open this sticky's editor (mount + focus). Triggered by a real
// tap/click — never by a pinch or a drag — so the iOS keyboard only appears on
// an intentional tap, and inside a user gesture so it actually shows.
// Refused while a live-session peer holds the note (their lease must expire
// or release first); on success, WE claim the editing hold.
export function editSticky(boardId: string, id: string): void {
  if (remoteHoldOn(boardId, id)) return;
  raiseSticky(boardId, id);
  setSelectedStickyId(id);
  setEditingStickyId(id);
  holdSticky(boardId, id, HoldKind.Editing);
}

// Leave edit mode (click outside / Escape / delete).
export function exitEditing(): void {
  setEditingStickyId(null);
  releaseHold();
}

// Notes the user just created (vs. loaded/imported), so the Sticky can play its enter
// animation exactly once on mount. `take` consumes the flag → initial-load notes (never
// marked) don't animate.
const freshStickies = new Set<string>();
export const markStickyFresh = (id: string): void => {
  freshStickies.add(id);
};
export const takeStickyFresh = (id: string): boolean => freshStickies.delete(id);
