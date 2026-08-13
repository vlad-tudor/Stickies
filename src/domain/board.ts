// Pure board-domain logic: the data model + every stateless rule over it.
// No store, no persistence, no DOM — the Phase 7 CRDT rewrite replaces
// stickyStore's state layer and keeps all of this as-is.
import { marked } from "marked";
import { newId } from "~/utils/id";
import { asTone, DEFAULT_TONE, type Tone } from "~/utils/tones";

// Minimum sticky size (px). Width must fit the editor toolbar; height mirrors
// --total-sticky-height in sticky.scss — keep these in sync.
export const MIN_STICKY_WIDTH = 256;
export const MIN_STICKY_HEIGHT = 320;

// An image note's picture: id into the IndexedDB blob store + pixel dims (aspect).
// Bytes live out-of-band; only this ref rides the board JSON.
export type ImageRef = { id: string; w: number; h: number };

export type StickyNote = {
  id: string;
  position: [number, number];
  dimensions: [number, number];
  content: string; // HTML
  color: Tone;
  z: number; // stacking order — an explicit field, NOT array position (topmost = max)
  image?: ImageRef; // present => image note (content unused)
};

// A link between two stickies (by id).
export type Thread = { id: string; from: string; to: string };

export type Board = {
  id: string;
  name: string;
  stickies: StickyNote[];
  threads: Thread[];
  bgColor: Tone;
};

// ── geometry ──

// World-space center of a note (encapsulates position=[top,left], dims=[w,h]).
export const stickyCenter = (
  note: Pick<StickyNote, "position" | "dimensions">,
): { x: number; y: number } => ({
  x: note.position[1] + note.dimensions[0] / 2,
  y: note.position[0] + note.dimensions[1] / 2,
});

// Where a thread attaches: the connect dot — horizontal center, band middle.
// 16 = half the band height (--total-sticky-handle-height, 2rem) in sticky.scss.
export const threadAnchor = (
  note: Pick<StickyNote, "position" | "dimensions">,
): { x: number; y: number } => ({
  x: note.position[1] + note.dimensions[0] / 2,
  y: note.position[0] + 16,
});

// ── construction ──

export function makeBoard(
  name: string,
  stickies: StickyNote[] = [],
  bgColor: Tone = DEFAULT_TONE,
  threads: Thread[] = [],
): Board {
  return { id: newId(), name, stickies, threads, bgColor };
}

// ── normalization (persisted / imported / shared data -> current model) ──

// Drop threads whose endpoints no longer exist (deleted/replaced stickies).
export const normalizeThreads = (
  threads: Thread[] | undefined,
  stickies: StickyNote[],
): Thread[] => {
  if (!threads) return [];
  const noteIds = new Set(stickies.map((sticky) => sticky.id));
  return threads.filter((thread) => noteIds.has(thread.from) && noteIds.has(thread.to));
};

// Content is HTML. Legacy notes stored markdown — convert them once on ingest.
const looksLikeHtml = (content: string): boolean => /<\/?[a-z][\s\S]*>/i.test(content);
const asHtml = (content: string): string =>
  !content || looksLikeHtml(content) ? content : (marked(content) as string);

// Coerce persisted/imported notes: legacy hex colors -> tones, markdown -> HTML,
// missing z (pre-z boards: array order WAS the z-order) -> array index. z is then
// compacted to 0..n-1 (raise grows it unbounded between loads), order preserved.
export const normalizeStickies = (stickies: StickyNote[]): StickyNote[] => {
  const coerced = stickies.map((sticky, index) => ({
    ...sticky,
    color: asTone(sticky.color),
    content: asHtml(sticky.content),
    z: typeof sticky.z === "number" ? sticky.z : index,
  }));
  const compactZById = new Map(
    [...coerced].sort((left, right) => left.z - right.z).map((sticky, rank) => [sticky.id, rank]),
  );
  return coerced.map((sticky) => ({ ...sticky, z: compactZById.get(sticky.id)! }));
};

export const normalizeBoard = (board: Board): Board => {
  const stickies = normalizeStickies(board.stickies);
  return {
    ...board,
    bgColor: asTone(board.bgColor),
    stickies,
    threads: normalizeThreads(board.threads, stickies),
  };
};

// ── naming ──

export function deduplicateName(base: string, boards: Board[]): string {
  const names = new Set(boards.map((board) => board.name));
  if (!names.has(base)) return base;
  let suffix = 1;
  while (names.has(`${base} (${suffix})`)) suffix++;
  return `${base} (${suffix})`;
}

// Lowest free "Board N" — count-based numbering clashes after deletes.
export function nextBoardName(boards: Board[]): string {
  const names = new Set(boards.map((board) => board.name));
  let candidate = boards.length + 1;
  while (names.has(`Board ${candidate}`)) candidate++;
  return `Board ${candidate}`;
}
