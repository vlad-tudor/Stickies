// Theme contract: persisted key/values and the <html> data-theme attribute —
// index.html's inline pre-paint script depends on both staying stable.
import { test, expect } from "bun:test";
import { theme, setTheme, toggleTheme, Theme } from "./themeStore";

const THEME_KEY = "stickies-theme";

test("setTheme persists and stamps <html> for dark", () => {
  setTheme(Theme.Dark);
  expect(theme()).toBe(Theme.Dark);
  expect(localStorage.getItem(THEME_KEY)).toBe(Theme.Dark);
  expect(document.documentElement.dataset.theme).toBe(Theme.Dark);
});

test("light mode removes the data-theme attribute (tokens' default state)", () => {
  setTheme(Theme.Light);
  expect(theme()).toBe(Theme.Light);
  expect(localStorage.getItem(THEME_KEY)).toBe(Theme.Light);
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

test("toggleTheme flips both ways", () => {
  setTheme(Theme.Light);
  toggleTheme();
  expect(theme()).toBe(Theme.Dark);
  toggleTheme();
  expect(theme()).toBe(Theme.Light);
});
