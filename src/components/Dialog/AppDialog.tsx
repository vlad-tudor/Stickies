import { createEffect, onCleanup, Show } from "solid-js";
import { dialog, resolveDialog } from "~/stores/dialogStore";

import "./app-dialog.scss";

// Single themed confirm dialog, mounted at the app root. Driven by dialogStore.
export const AppDialog = () => {
  // While open: Esc cancels, Enter confirms.
  createEffect(() => {
    if (!dialog()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolveDialog(false);
      else if (e.key === "Enter") resolveDialog(true);
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={dialog()}>
      {(d) => (
        // backdrop press = cancel; stop it on the panel so inside presses don't dismiss
        <div class="dialog-backdrop" onPointerDown={() => resolveDialog(false)}>
          <div class="dialog" role="dialog" aria-modal="true" onPointerDown={(e) => e.stopPropagation()}>
            <Show when={d().title}>{(t) => <h2 class="dialog-title">{t()}</h2>}</Show>
            <p class="dialog-message">{d().message}</p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-cancel" onClick={() => resolveDialog(false)}>
                {d().cancelText ?? "Cancel"}
              </button>
              <button
                class={`dialog-btn dialog-confirm${d().danger ? " danger" : ""}`}
                onClick={() => resolveDialog(true)}
              >
                {d().confirmText ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};
