// Confirm-dialog contract: one pending request at a time, promise resolution
// on confirm/cancel, safe no-op resolution with nothing open.
import { test, expect } from "bun:test";
import { dialog, confirmDialog, resolveDialog } from "./dialogStore";

test("confirmDialog opens a request and resolves true on confirm", async () => {
  const answer = confirmDialog("Delete this?", { danger: true });
  expect(dialog()?.message).toBe("Delete this?");
  expect(dialog()?.danger).toBe(true);
  resolveDialog(true);
  expect(await answer).toBe(true);
  expect(dialog()).toBeNull(); // closed
});

test("resolves false on cancel/dismiss", async () => {
  const answer = confirmDialog("Sure?");
  resolveDialog(false);
  expect(await answer).toBe(false);
  expect(dialog()).toBeNull();
});

test("resolving with no open dialog is a no-op", () => {
  expect(dialog()).toBeNull();
  resolveDialog(true); // must not throw
  expect(dialog()).toBeNull();
});
