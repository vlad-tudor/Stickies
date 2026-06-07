import { createSignal } from "solid-js";
import { raiseStickyById } from "./stickyStore";

// The single sticky currently being edited (its id), or null. Global so only
// one editor/toolbar can exist at a time — independent of focus/blur, which is
// unreliable because our drag handles call preventDefault.
export const [editingStickyId, setEditingStickyId] = createSignal<string | null>(null);

// ── Interaction intents (the only places that mutate selection/edit state) ──

// Focus a sticky: raise it to the top AND activate its editor. Called from the
// sticky root pointerdown, so any press (body, band, buttons, resize) focuses.
export function editSticky(id: string): void {
  raiseStickyById(id);
  setEditingStickyId(id);
}

// Leave edit mode (click outside / Escape / delete).
export function exitEditing(): void {
  setEditingStickyId(null);
}
