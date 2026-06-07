// Curated sticky/board palette — the constrained set of paper tones.
// A stored color is one of these keys, NOT a hex. It renders as the
// matching CSS var (var(--s-<tone>)), which flips in dark mode.

export const TONES = ["cream", "butter", "sage", "rose", "sky", "grey"] as const;
export type Tone = (typeof TONES)[number];

export const DEFAULT_TONE: Tone = "cream";

// Light-mode reference RGB for each tone. Used ONLY to migrate legacy
// custom hex colors to the nearest curated tone — never rendered (runtime
// rendering uses the CSS vars, which carry their own dark-mode values).
const TONE_RGB: Record<Tone, [number, number, number]> = {
  cream:  [0xf4, 0xec, 0xc9],
  butter: [0xf0, 0xd9, 0x8a],
  sage:   [0xcf, 0xd6, 0xb8],
  rose:   [0xec, 0xc9, 0xbf],
  sky:    [0xc5, 0xd2, 0xd8],
  grey:   [0xe2, 0xdc, 0xcb],
};

export const toneVar = (tone: Tone): string => `var(--s-${tone})`;

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

function parseHex(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function nearestTone(hex: string): Tone {
  const rgb = parseHex(hex);
  if (!rgb) return DEFAULT_TONE;
  let best: Tone = DEFAULT_TONE;
  let bestDist = Infinity;
  for (const tone of TONES) {
    const [r, g, b] = TONE_RGB[tone];
    const dist = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = tone;
    }
  }
  return best;
}

// Normalize any persisted/imported color value to a curated tone.
export function asTone(value: unknown): Tone {
  if (isTone(value)) return value;
  if (typeof value === "string") return nearestTone(value);
  return DEFAULT_TONE;
}
