// Stable per-device collab identity (no accounts): a friendly name + a tone,
// minted once and kept in localStorage. Broadcast via awareness so peers can
// label cursors/edits — and it's ALSO what makes peer counting work at all:
// y-websocket only propagates a client's awareness entry once that client has
// set some local state.
import { TONES, type Tone } from "~/utils/tones";

const IDENTITY_KEY = "stickies.identity";

export type Identity = { name: string; color: Tone };

const ADJECTIVES = [
  "Amber",
  "Brisk",
  "Calm",
  "Dapper",
  "Eager",
  "Fleet",
  "Gentle",
  "Keen",
  "Lucky",
  "Mellow",
  "Nimble",
  "Quiet",
];
const ANIMALS = [
  "Fox",
  "Owl",
  "Otter",
  "Lynx",
  "Heron",
  "Badger",
  "Swift",
  "Mole",
  "Wren",
  "Hare",
  "Newt",
  "Crane",
];

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const generate = (): Identity => ({
  name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
  color: pick(TONES),
});

export function localIdentity(): Identity {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      // JSON.parse is untyped; this cast states the persisted identity format
      const stored = JSON.parse(raw) as Identity;
      if (stored.name && stored.color) return stored;
    }
  } catch {
    /* corrupt -> regenerate */
  }
  const fresh = generate();
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(fresh));
  return fresh;
}
