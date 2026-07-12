import * as Y from "yjs";
import type { Board, StickyNote, Thread } from "~/domain/board";
import type { Tone } from "~/utils/tones";

// The Yjs side of the board store: doc schema, typed access, the doc registry,
// and doc-level operations. Board CONTENT is CRDT state — one Y.Doc per board
// (a board = a collab room later):
//   meta      { init, bgColor }
//   stickies  id -> Y.Map of note fields  (per-FIELD last-write-wins)
//   threads   id -> plain Thread          (immutable: add/remove only)
// Nothing here touches solid — boardProjection binds doc events to reactive
// state, and the action modules mutate docs through `transact`.

// ── schema keys ──

// Named maps inside every board doc.
export const DocMap = {
  Stickies: "stickies",
  Threads: "threads",
  Meta: "meta",
} as const;

// Keys inside a doc's meta map. `Init` marks a doc as seeded — hydration uses
// it to tell "empty because never seeded" from "empty because the update log
// hasn't applied yet".
export const MetaKey = {
  Init: "init",
  BgColor: "bgColor",
} as const;

// Yjs map-event actions (`change.action`); the union mirrors yjs's own —
// it doesn't export the type, but `satisfies` breaks if the values drift.
export const YAction = {
  Add: "add",
  Update: "update",
  Delete: "delete",
} as const satisfies Record<string, "add" | "update" | "delete">;

// ── typed doc access ──

export type NoteField = keyof StickyNote;
export type NoteFieldValue = StickyNote[NoteField];

// A note inside a doc: its fields as a Y.Map, so concurrent edits to DIFFERENT
// fields of one note both survive (per-field last-write-wins).
export type YNote = Y.Map<NoteFieldValue>;
export type MetaValue = boolean | Tone;

export const stickyMapOf = (doc: Y.Doc): Y.Map<YNote> =>
  doc.getMap(DocMap.Stickies);
export const threadMapOf = (doc: Y.Doc): Y.Map<Thread> =>
  doc.getMap(DocMap.Threads);
export const metaMapOf = (doc: Y.Doc): Y.Map<MetaValue> =>
  doc.getMap(DocMap.Meta);

// The one Yjs -> plain boundary. yjs types toJSON() as any; every write into a
// YNote goes through setYNoteFields, so its shape IS StickyNote.
export const noteFromY = (yNote: YNote): StickyNote =>
  yNote.toJSON() as StickyNote;

export const noteToY = (note: StickyNote): YNote => {
  const yNote: YNote = new Y.Map();
  setYNoteFields(yNote, note);
  return yNote;
};

const setYNoteFields = (yNote: YNote, fields: Partial<StickyNote>): void => {
  // Object.keys forgets key types (TS limitation) — restore them here, once.
  for (const field of Object.keys(fields) as NoteField[]) {
    const value = fields[field];
    if (value !== undefined) yNote.set(field, value);
  }
};

// ── doc registry ──

const docs = new Map<string, Y.Doc>();

export const docOf = (boardId: string): Y.Doc | undefined => docs.get(boardId);

export const registerDoc = (boardId: string, doc: Y.Doc): void => {
  docs.set(boardId, doc);
};

export const destroyDoc = (boardId: string): void => {
  docs.get(boardId)?.destroy();
  docs.delete(boardId);
};

export const allDocIds = (): string[] => [...docs.keys()];

// Run `mutate` in a transaction on the board's doc; observers update the
// projection synchronously before this returns. False if the board is gone.
export const transact = (
  boardId: string,
  mutate: (doc: Y.Doc) => void,
): boolean => {
  const doc = docs.get(boardId);
  if (!doc) return false;
  doc.transact(() => mutate(doc));
  return true;
};

// ── doc-level operations ──

// Write a board's content into its doc (used for boards created this session
// and for first-run seeding of never-persisted docs).
export const seedDoc = (doc: Y.Doc, board: Board): void => {
  doc.transact(() => {
    const meta = metaMapOf(doc);
    meta.set(MetaKey.Init, true);
    meta.set(MetaKey.BgColor, board.bgColor);
    const stickyMap = stickyMapOf(doc);
    for (const sticky of board.stickies) {
      stickyMap.set(sticky.id, noteToY(sticky));
    }
    const threadMap = threadMapOf(doc);
    for (const thread of board.threads) threadMap.set(thread.id, thread);
  });
};

// Set `update`'s fields on the note's Y.Map — field-level writes keep the
// per-field last-write-wins granularity.
export const setNoteFieldsInDoc = (
  doc: Y.Doc,
  stickyId: string,
  update: Partial<StickyNote>,
): void => {
  const yNote = stickyMapOf(doc).get(stickyId);
  if (yNote) setYNoteFields(yNote, update);
};

// Remove a note from its doc along with every thread touching it (threads are
// intra-board; a note's links die with it).
export const deleteNoteFromDoc = (doc: Y.Doc, stickyId: string): void => {
  stickyMapOf(doc).delete(stickyId);
  const threadMap = threadMapOf(doc);
  const touching: string[] = [];
  threadMap.forEach((thread, threadId) => {
    if (thread.from === stickyId || thread.to === stickyId) {
      touching.push(threadId);
    }
  });
  for (const threadId of touching) threadMap.delete(threadId);
};
