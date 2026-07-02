import { createSignal } from "solid-js";

// Themed replacement for the native `confirm()`. `confirmDialog(...)` returns a promise
// that resolves true (confirmed) / false (cancelled or dismissed); a single <AppDialog>
// at the app root renders the current request.
export type ConfirmOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean; // style the confirm button as destructive
};

type DialogState = ConfirmOptions & { message: string; resolve: (ok: boolean) => void };

const [dialog, setDialog] = createSignal<DialogState | null>(null);
export { dialog };

export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => setDialog({ message, ...opts, resolve }));
}

export function resolveDialog(ok: boolean): void {
  const d = dialog();
  if (!d) return;
  setDialog(null);
  d.resolve(ok);
}
