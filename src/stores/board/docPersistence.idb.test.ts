// Doc persistence, the ONE suite that runs with IndexedDB available. It needs
// its own project (`bun run test:idb`) because `canPersistDocs` is a
// module-level `typeof indexedDB !== "undefined"` read once at import: bun runs
// a project's files in a single process, so registering fake-indexeddb for the
// main suite would silently switch every other test onto the persistence path.
// The default project excludes this file via --path-ignore-patterns.
//
// What's under test is hydrateBoard's fork (boardActions.ts): with IDB present a
// board's doc attaches to its stored update log, and once that log has applied,
// the `init` meta flag decides between SEEDING the doc from the JSON snapshot
// (never persisted before) and RESUMING the doc's own CRDT history (ignoring
// the snapshot's contents). Getting that backwards either wipes a board's
// history or lets a stale snapshot overwrite it.
import { test, expect, describe } from "bun:test";
import { loadBoards, activeBoardId, stickies, type Board } from "~/stores/stickyStore";
import { docOf, stickyMapOf, metaMapOf, MetaKey, noteToY } from "~/stores/board/boardDocs";
import { canPersistDocs } from "~/stores/board/docPersistence";
import { makeNote } from "~/test/liveBoard";

const STORAGE_KEY = "stickies-boards";

const makeBoard = (id: string, notes: string[]): Board => ({
  id,
  name: `Board ${id}`,
  stickies: notes.map((noteId) => makeNote(noteId)),
  threads: [],
  bgColor: "cream",
});

// Each test uses a board id nothing has persisted yet, so its IDB database is
// unique and tests cannot contaminate one another in the shared process.
let nextBoardId = 0;
const freshBoardId = (): string => `idb-board-${Date.now()}-${nextBoardId++}`;

const writeSnapshot = (board: Board): void => {
  localStorage.clear();
  window.location.hash = "";
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ boards: [board], activeBoardId: board.id }),
  );
};

// Hydration finishes asynchronously (y-indexeddb's `synced` event), and nothing
// exposes a promise for it, so poll for the state the test is waiting on.
const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const docNoteIds = (boardId: string): string[] => [...stickyMapOf(docOf(boardId)!).keys()].sort();

const hydrated = (boardId: string): boolean => Boolean(metaMapOf(docOf(boardId)!).get(MetaKey.Init));

describe("doc persistence is actually on in this project", () => {
  test("canPersistDocs is true", () => {
    // The premise of every test below: without this, they would all pass by
    // silently taking the no-IDB path instead of the one under test.
    expect(canPersistDocs).toBe(true);
  });
});

describe("hydrateBoard decides seed vs resume on the init flag", () => {
  test("a board with no stored log is seeded from the JSON snapshot", async () => {
    const boardId = freshBoardId();
    writeSnapshot(makeBoard(boardId, ["a", "b"]));

    loadBoards();
    await waitFor(() => hydrated(boardId), "first-run seed");

    // nothing was stored for this board, so the snapshot is the source
    expect(docNoteIds(boardId)).toEqual(["a", "b"]);
  });

  test("a board with a stored log resumes it and ignores the snapshot", async () => {
    const boardId = freshBoardId();
    writeSnapshot(makeBoard(boardId, ["a"]));

    loadBoards();
    await waitFor(() => hydrated(boardId), "first-run seed");

    // a change that lives ONLY in the doc's history, never in the snapshot
    const doc = docOf(boardId)!;
    doc.transact(() => stickyMapOf(doc).set("doc-only", noteToY(makeNote("doc-only"))));

    // reload, with a snapshot that knows nothing about it and carries a note of
    // its own — the two sources have diverged
    writeSnapshot(makeBoard(boardId, ["a", "snapshot-only"]));
    loadBoards();
    await waitFor(() => docNoteIds(boardId).includes("doc-only"), "resume from stored log");

    // the doc's own history wins outright: its note survived and the snapshot's
    // never entered the doc
    expect(docNoteIds(boardId)).toEqual(["a", "doc-only"]);

    // and the projection is rebuilt FROM the doc, so the screen agrees with it
    await waitFor(
      () => stickies().some((sticky) => sticky.id === "doc-only"),
      "projection synced from doc",
    );
    expect(stickies().map((sticky) => sticky.id).sort()).toEqual(["a", "doc-only"]);
    expect(activeBoardId()).toBe(boardId);
  });
});
