// The one debounced-writer idiom, shared by every store that persists: bursts
// of changes coalesce into a single write after `delayMs`; opt into
// flush-on-page-hide so the last change is never lost on tab close/switch.
export type DebouncedWrite = {
  schedule: () => void; // (re)arm the debounce
  flushNow: () => void; // cancel the timer and write immediately
};

export const createDebouncedWrite = (
  write: () => void,
  options: { delayMs?: number; flushOnPageHide?: boolean } = {},
): DebouncedWrite => {
  const { delayMs = 250, flushOnPageHide = false } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flushNow = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    write();
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushNow, delayMs);
  };

  if (flushOnPageHide && typeof window !== "undefined") {
    const flushIfPending = (): void => {
      if (timer) flushNow();
    };
    window.addEventListener("pagehide", flushIfPending);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushIfPending();
    });
  }

  return { schedule, flushNow };
};
