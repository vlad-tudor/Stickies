import { createSignal } from "solid-js";
import { raiseStickyById } from "./stickyStore";

// The single sticky currently being edited (its id), or null. Global so only
// one editor/toolbar can exist at a time — independent of focus/blur, which is
// unreliable because our drag handles call preventDefault.
export const [editingStickyId, setEditingStickyId] = createSignal<string | null>(null);

// in-progress thread drag: source sticky id + current cursor in WORLD coords,
// or null when not connecting. Drives the live "rubber-band" line.
export const [pendingThread, setPendingThread] = createSignal<
  { from: string; to: { x: number; y: number } } | null
>(null);

// selected thread (for the delete popover): its id + the SCREEN point where it
// was clicked (the popover anchors there), or null.
export const [selectedThread, setSelectedThread] = createSignal<
  { id: string; x: number; y: number } | null
>(null);

// ── Interaction intents (the only places that mutate selection/edit state) ──

// Select on press: raise to the top and close any OTHER editor — but don't open
// this one. Cheap (no editor mount / focus), so it's safe on every pointerdown
// incl. the first finger of a pinch and the start of a drag.
export function selectSticky(id: string): void {
  if (editingStickyId() !== id) setEditingStickyId(null);
  setSelectedThread(null); // interacting with a note dismisses the thread popover
  raiseStickyById(id);
}

// Enter edit: open this sticky's editor (mount + focus). Triggered by a real
// tap/click — never by a pinch or a drag — so the iOS keyboard only appears on
// an intentional tap, and inside a user gesture so it actually shows.
export function editSticky(id: string): void {
  raiseStickyById(id);
  setEditingStickyId(id);
}

// Leave edit mode (click outside / Escape / delete).
export function exitEditing(): void {
  setEditingStickyId(null);
}
