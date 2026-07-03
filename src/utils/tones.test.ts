// Tone normalization contract — persisted/imported colors must keep mapping
// the same way (stored boards and share URLs depend on it).
import { test, expect } from "bun:test";
import { asTone, isTone, toneVar, TONES, DEFAULT_TONE } from "./tones";

test("valid tones pass through", () => {
  for (const t of TONES) expect(asTone(t)).toBe(t);
});

test("legacy hex colors map to the nearest tone", () => {
  // exact light-mode reference values
  expect(asTone("#f4ecc9")).toBe("cream");
  expect(asTone("#f0d98a")).toBe("butter");
  expect(asTone("#cfd6b8")).toBe("sage");
  expect(asTone("#ecc9bf")).toBe("rose");
  expect(asTone("#c5d2d8")).toBe("sky");
  expect(asTone("#e2dccb")).toBe("grey");
  // off-reference hex still lands on the closest tone
  expect(asTone("#f1da8c")).toBe("butter");
});

test("junk values fall back to the default tone", () => {
  expect(asTone("not-a-color")).toBe(DEFAULT_TONE);
  expect(asTone("#12")).toBe(DEFAULT_TONE);
  expect(asTone(undefined)).toBe(DEFAULT_TONE);
  expect(asTone(42)).toBe(DEFAULT_TONE);
  expect(asTone(null)).toBe(DEFAULT_TONE);
});

test("isTone guards strictly", () => {
  expect(isTone("sage")).toBe(true);
  expect(isTone("#f4ecc9")).toBe(false);
  expect(isTone(3)).toBe(false);
});

test("toneVar renders the CSS var", () => {
  expect(toneVar("sky")).toBe("var(--s-sky)");
});
