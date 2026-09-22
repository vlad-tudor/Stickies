// Holds are LEASES, and the lease is the whole safety story: a peer that
// crashes mid-drag never sends a release, so the only thing that frees the note
// is its claim going stale. These tests drive that from the enforcement side —
// what the store actually refuses — rather than reading presence's internals.
//
// Two timing facts shape every expiry test here:
//   - `remoteHoldOn` compares the `now()` SIGNAL, not Date.now(). That signal
//     only advances on presence's 500ms sweep, so moving the clock forward is
//     not enough on its own; a real sweep tick has to land as well.
//   - bun's setSystemTime moves Date.now() while leaving real timers alone, so
//     the sweep still fires on real time and reads the faked clock when it does.
import { test, expect, describe, afterEach, setSystemTime } from "bun:test";
import {
  stickies,
  createStickyNote,
  moveStickyNote,
  resizeStickyNote,
  commitStickies,
  ensureNoteBody,
  type StickyNote,
} from "~/stores/stickyStore";
import { editSticky, editingStickyId, exitEditing } from "~/stores/uiStore";
import { remoteHoldOn, HoldKind } from "~/stores/board/presence";
import {
  freshLiveBoard,
  releaseLiveBoards,
  spawnPresencePeer,
  deliverPresence,
  makeNote,
  sleep,
} from "~/test/liveBoard";
import type { Awareness } from "y-protocols/awareness";

// HOLD_LEASE_MS in presence.ts: moving 1200, editing 8000.
const MOVING_LEASE_MS = 1200;

// One sweep is 500ms; wait past it so the `now()` signal definitely re-reads.
const PAST_SWEEP_MS = 650;

const projectionNote = (id: string): StickyNote | undefined =>
  stickies().find((sticky) => sticky.id === id);

// A peer claims a sticky, then hands us its state the way a provider would.
const peerClaims = (
  peer: Awareness,
  local: Awareness,
  stickyId: string,
  kind: HoldKind = HoldKind.Moving,
): void => {
  peer.setLocalStateField("hold", { stickyId, kind, at: Date.now() });
  deliverPresence(peer, local);
};

// Let the clock run past a lease AND let one real sweep tick land, so the
// reactive `now()` behind remoteHoldOn actually re-reads the faked time.
const expireLease = async (byMs: number): Promise<void> => {
  setSystemTime(new Date(Date.now() + byMs));
  await sleep(PAST_SWEEP_MS);
};

afterEach(() => {
  setSystemTime();
  exitEditing();
  commitStickies();
  releaseLiveBoards();
});

describe("a peer's hold is enforced against local gestures", () => {
  test("a held note refuses our move and our resize", () => {
    const { boardId, awareness } = freshLiveBoard();
    createStickyNote(boardId, makeNote("a", { position: [0, 0], dimensions: [300, 320] }));

    peerClaims(spawnPresencePeer(), awareness, "a");
    expect(remoteHoldOn(boardId, "a")).toBeDefined();

    moveStickyNote(boardId, "a", [111, 111]);
    resizeStickyNote(boardId, "a", [500, 500]);

    // both refused at the top of the action — the projection never moved
    expect(projectionNote("a")!.position).toEqual([0, 0]);
    expect(projectionNote("a")!.dimensions).toEqual([300, 320]);
  });

  test("an unheld note on the same live board still moves", () => {
    const { boardId, awareness } = freshLiveBoard();
    createStickyNote(boardId, makeNote("a"));
    createStickyNote(boardId, makeNote("b"));

    peerClaims(spawnPresencePeer(), awareness, "a");

    // the hold is per-sticky, not per-board
    moveStickyNote(boardId, "b", [111, 111]);
    expect(projectionNote("b")!.position).toEqual([111, 111]);
  });
});

describe("leases expire", () => {
  test("a stale hold frees the note for local gestures again", async () => {
    const { boardId, awareness } = freshLiveBoard();
    createStickyNote(boardId, makeNote("a", { position: [0, 0] }));

    peerClaims(spawnPresencePeer(), awareness, "a");
    expect(remoteHoldOn(boardId, "a")).toBeDefined();

    await expireLease(MOVING_LEASE_MS + 500);

    expect(remoteHoldOn(boardId, "a")).toBeUndefined();
    moveStickyNote(boardId, "a", [111, 111]);
    expect(projectionNote("a")!.position).toEqual([111, 111]);
  });

  test("a rebuild from an unrelated field does not extend the lease", async () => {
    const { boardId, awareness } = freshLiveBoard();
    createStickyNote(boardId, makeNote("a", { position: [0, 0] }));

    const peer = spawnPresencePeer();
    peerClaims(peer, awareness, "a");

    // Part-way through the lease the peer publishes something else entirely.
    // Its pointer CHANGED, so this delivery does fire `change` and rebuild the
    // board's presence — the case where an unchanged hold could wrongly pick up
    // a fresh seenAt and become immortal.
    setSystemTime(new Date(Date.now() + 800));
    peer.setLocalStateField("pointer", { x: 5, y: 5, at: Date.now() });
    deliverPresence(peer, awareness);
    expect(remoteHoldOn(boardId, "a")).toBeDefined(); // still inside the lease

    // past the lease as measured from the ORIGINAL claim, not the rebuild
    await expireLease(MOVING_LEASE_MS - 800 + 300);

    expect(remoteHoldOn(boardId, "a")).toBeUndefined();
  });
});

describe("a peer's hold gates the editor", () => {
  test("a held LEGACY note refuses to open, a fragment-backed one co-edits", () => {
    const { boardId, awareness } = freshLiveBoard();
    createStickyNote(boardId, makeNote("legacy"));
    createStickyNote(boardId, makeNote("shared"));
    ensureNoteBody(boardId, "shared"); // gives it the body fragment

    const peer = spawnPresencePeer();
    peerClaims(peer, awareness, "legacy", HoldKind.Editing);

    // legacy: the hold guards the seeding window before a fragment exists
    editSticky(boardId, "legacy");
    expect(editingStickyId()).toBeNull();

    // fragment-backed: character-level merge makes co-editing safe, so the
    // same kind of hold must NOT lock anyone out
    peerClaims(peer, awareness, "shared", HoldKind.Editing);
    editSticky(boardId, "shared");
    expect(editingStickyId()).toBe("shared");
  });
});
