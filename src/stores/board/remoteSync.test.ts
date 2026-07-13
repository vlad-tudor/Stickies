// The collab gate: proves the doc→projection binding under REMOTE updates —
// the exact machinery a live session drives — with no server. A "peer" is a
// second Y.Doc synced via encodeStateAsUpdate/applyUpdate, which is precisely
// what a provider does over the wire; the provider will add transport, not
// semantics.
import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import {
  loadBoards,
  activeBoardId,
  boards,
  stickies,
  threads,
  activeBgColor,
  createBoard,
  renameBoard,
  createStickyNote,
  updateStickyNote,
  moveStickyNote,
  commitStickies,
  addThread,
  ensureNoteBody,
  noteHasBodyFragment,
  type StickyNote,
} from "~/stores/stickyStore";
import {
  docOf,
  stickyMapOf,
  threadMapOf,
  metaMapOf,
  noteToY,
  MetaKey,
} from "~/stores/board/boardDocs";

const makeNote = (id: string, over: Partial<StickyNote> = {}): StickyNote => ({
  id,
  position: [0, 0],
  dimensions: [300, 320],
  content: "",
  color: "cream",
  z: 0,
  ...over,
});

// Fresh single-board store; returns the board id and its LIVE local doc.
const freshBoard = (): { boardId: string; local: Y.Doc } => {
  localStorage.clear();
  window.location.hash = "";
  loadBoards();
  const boardId = activeBoardId();
  const local = docOf(boardId);
  if (!local) throw new Error("active board has no doc");
  return { boardId, local };
};

// A remote peer: a second doc starting from the local doc's full state.
const spawnPeer = (local: Y.Doc): Y.Doc => {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(local));
  return peer;
};

// Deliver `source`'s missing updates to `target` (one direction — what a
// provider does per message).
const deliver = (source: Y.Doc, target: Y.Doc): void => {
  Y.applyUpdate(
    target,
    Y.encodeStateAsUpdate(source, Y.encodeStateVector(target)),
  );
};

// Full exchange in both directions (a sync round).
const syncRound = (a: Y.Doc, b: Y.Doc): void => {
  deliver(a, b);
  deliver(b, a);
};

const projectionNote = (id: string): StickyNote | undefined =>
  stickies().find((sticky) => sticky.id === id);

describe("remote updates reach the projection", () => {
  test("remote note add appears with all fields", () => {
    const { local } = freshBoard();
    const peer = spawnPeer(local);

    stickyMapOf(peer).set(
      "remote-1",
      noteToY(makeNote("remote-1", { content: "<p>from peer</p>", z: 5 })),
    );
    deliver(peer, local);

    const arrived = projectionNote("remote-1");
    expect(arrived).toBeDefined();
    expect(arrived!.content).toBe("<p>from peer</p>");
    expect(arrived!.z).toBe(5);
  });

  test("remote field edit updates that field and preserves the rest", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a", { position: [10, 20] }));
    const peer = spawnPeer(local);

    stickyMapOf(peer).get("a")!.set("content", "<p>edited remotely</p>");
    deliver(peer, local);

    const edited = projectionNote("a")!;
    expect(edited.content).toBe("<p>edited remotely</p>");
    expect(edited.position).toEqual([10, 20]);
  });

  test("remote note delete removes it from the projection", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a"));
    createStickyNote(boardId, makeNote("b"));
    addThread(boardId, "a", "b");
    const peer = spawnPeer(local);

    // a remote peer deleting "a" also prunes its threads (same store code)
    stickyMapOf(peer).delete("a");
    threadMapOf(peer).forEach((thread, threadId) => {
      if (thread.from === "a" || thread.to === "a") {
        threadMapOf(peer).delete(threadId);
      }
    });
    deliver(peer, local);

    expect(projectionNote("a")).toBeUndefined();
    expect(projectionNote("b")).toBeDefined();
    expect(threads().length).toBe(0);
  });

  test("remote thread add appears", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a"));
    createStickyNote(boardId, makeNote("b"));
    const peer = spawnPeer(local);

    threadMapOf(peer).set("t-remote", { id: "t-remote", from: "a", to: "b" });
    deliver(peer, local);

    expect(threads().map((thread) => thread.id)).toEqual(["t-remote"]);
  });

  test("remote board color change applies", () => {
    const { local } = freshBoard();
    const peer = spawnPeer(local);

    metaMapOf(peer).set(MetaKey.BgColor, "sage");
    deliver(peer, local);

    expect(activeBgColor()).toBe("sage");
  });

  test("a local rename replicates into the doc for peers", () => {
    const { boardId, local } = freshBoard();
    const peer = spawnPeer(local);

    renameBoard(boardId, "Trip plan");
    deliver(local, peer);

    expect(metaMapOf(peer).get(MetaKey.Name)).toBe("Trip plan");
  });

  test("a remote rename is adopted locally, deduped against other boards", () => {
    const { boardId, local } = freshBoard();
    createBoard("Taken"); // a DIFFERENT local board already owns this name
    const peer = spawnPeer(local);

    metaMapOf(peer).set(MetaKey.Name, "Taken");
    deliver(peer, local);

    const renamed = boards().find((board) => board.id === boardId)!;
    expect(renamed.name).toBe("Taken (1)"); // adopted, local uniqueness kept
  });
});

describe("body fragments (the co-editing channel)", () => {
  test("the fragment never leaks into the projection or plain note objects", () => {
    const { boardId } = freshBoard();
    createStickyNote(boardId, makeNote("a", { content: "<p>hi</p>" }));
    const fragment = ensureNoteBody(boardId, "a");
    expect(fragment).toBeDefined();
    expect(ensureNoteBody(boardId, "a")).toBe(fragment!); // get-or-create is stable
    expect(noteHasBodyFragment(boardId, "a")).toBe(true);

    const projected = projectionNote("a")!;
    expect("body" in projected).toBe(false);
    expect(projected.content).toBe("<p>hi</p>");
  });

  test("remote fragment traffic flows without disturbing the projection", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a", { content: "<p>hi</p>" }));
    ensureNoteBody(boardId, "a");
    const peer = spawnPeer(local);

    // a peer "types": content lands inside the shared fragment
    const peerFragment = stickyMapOf(peer)
      .get("a")!
      .get("body") as Y.XmlFragment;
    peer.transact(() => {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText("typed remotely")]);
      peerFragment.insert(0, [paragraph]);
    });
    deliver(peer, local);

    // the keystroke arrived (fragment converged) but the projection only ever
    // carries plain note data — the mirrored HTML is written by editors
    const localFragment = stickyMapOf(local).get("a")!.get("body") as Y.XmlFragment;
    expect(localFragment.length).toBe(1);
    const projected = projectionNote("a")!;
    expect("body" in projected).toBe(false);
    expect(projected.content).toBe("<p>hi</p>");
  });
});

describe("concurrent edits", () => {
  test("same-field conflict converges identically on both docs and projection", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a"));
    const peer = spawnPeer(local);

    // both sides edit the SAME field without seeing each other
    updateStickyNote(boardId, "a", { content: "<p>local</p>" });
    stickyMapOf(peer).get("a")!.set("content", "<p>peer</p>");
    syncRound(local, peer);

    const localContent = String(stickyMapOf(local).get("a")!.get("content"));
    const peerContent = String(stickyMapOf(peer).get("a")!.get("content"));
    expect(["<p>local</p>", "<p>peer</p>"]).toContain(localContent); // a real value won
    expect(localContent).toBe(peerContent); // ...and it's the SAME winner on both
    expect(projectionNote("a")!.content).toBe(localContent);
  });

  test("different-field edits on one note BOTH survive (per-field LWW)", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a"));
    const peer = spawnPeer(local);

    updateStickyNote(boardId, "a", { color: "sky" });
    stickyMapOf(peer).get("a")!.set("content", "<p>peer text</p>");
    syncRound(local, peer);

    const merged = projectionNote("a")!;
    expect(merged.color).toBe("sky"); // local's edit
    expect(merged.content).toBe("<p>peer text</p>"); // peer's edit
    // and the docs agree with the projection
    expect(stickyMapOf(peer).get("a")!.get("color")).toBe("sky");
  });

  test("remote geometry mid-local-drag: transient wins on screen, commit wins in the doc", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a", { position: [0, 0] }));
    const peer = spawnPeer(local);

    // local drag in progress (projection-only transient write)
    moveStickyNote(boardId, "a", [111, 111]);

    // a remote move lands mid-drag — must NOT snap the dragged note back
    stickyMapOf(peer).get("a")!.set("position", [999, 999]);
    deliver(peer, local);
    expect(projectionNote("a")!.position).toEqual([111, 111]);

    // release: the commit is causally AFTER the integrated remote write, so it
    // wins on both sides once synced
    commitStickies();
    syncRound(local, peer);
    expect(projectionNote("a")!.position).toEqual([111, 111]);
    expect(stickyMapOf(peer).get("a")!.get("position")).toEqual([111, 111]);
  });

  test("remote clear beats a concurrent local field edit (note stays deleted)", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a"));
    const peer = spawnPeer(local);

    stickyMapOf(peer).clear();
    updateStickyNote(boardId, "a", { content: "<p>too late</p>" }); // concurrent
    syncRound(local, peer);

    // deleting the note's map wins over edits inside it, on both sides
    expect(projectionNote("a")).toBeUndefined();
    expect(stickyMapOf(peer).size).toBe(0);
    expect(stickyMapOf(local).size).toBe(0);
  });

  test("interleaved divergent sessions fully converge", () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a", { content: "<p>base</p>" }));
    const peer = spawnPeer(local);

    // local: add note + link it; peer: add its own note + edit the shared one
    createStickyNote(boardId, makeNote("local-2"));
    addThread(boardId, "a", "local-2");
    stickyMapOf(peer).set("peer-2", noteToY(makeNote("peer-2", { z: 9 })));
    stickyMapOf(peer).get("a")!.set("content", "<p>peer version</p>");

    syncRound(local, peer);

    // both docs identical, projection reflects the merged truth
    expect(stickyMapOf(local).toJSON()).toEqual(stickyMapOf(peer).toJSON());
    expect(threadMapOf(local).toJSON()).toEqual(threadMapOf(peer).toJSON());
    expect(stickies().map((sticky) => sticky.id).sort()).toEqual([
      "a",
      "local-2",
      "peer-2",
    ]);
    expect(projectionNote("a")!.content).toBe("<p>peer version</p>");
    expect(threads().length).toBe(1);
  });
});
