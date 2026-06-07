import { createSignal } from "solid-js";

// Global chrome theme — separate from the per-sticky ink contrast.
// Drives `data-theme="dark"` on <html>; all design tokens flip under it.
// Restored before first paint by an inline script in index.html (same key)
// to avoid a flash; this store reads the same key for its initial value.

export type Theme = "light" | "dark";

const THEME_KEY = "stickies-theme";

function readStored(): Theme {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}

const [theme, setThemeSignal] = createSignal<Theme>(readStored());

export { theme };

export function setTheme(next: Theme): void {
  setThemeSignal(next);
  apply(next);
  localStorage.setItem(THEME_KEY, next);
}

export function toggleTheme(): void {
  setTheme(theme() === "dark" ? "light" : "dark");
}
