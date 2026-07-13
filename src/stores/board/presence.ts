import { createSignal } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import type { Awareness } from "y-protocols/awareness";
import type { Tone } from "~/utils/tones";
import type { Identity } from "~/utils/identity";

// Ephemeral presence over each live session's awareness channel: which peer is
// HOLDING which sticky (editing it, or moving/resizing it). Holds are leases —
// they expire when the holder goes quiet — and they're enforcement inputs: the
// store refuses geometry writes and the UI refuses editor-opens on a note a
// peer holds. Nothing here touches the doc; a crashed peer's hold simply times
// out (awareness state also vanishes on disconnect).

export const HoldKind = {
  Editing: "editing",
  Moving: "moving",
} as const;
export type HoldKind = (typeof HoldKind)[keyof typeof HoldKind];

export type RemoteHold = {
  stickyId: string;
  kind: HoldKind;
  name: string;
  color: Tone;
  clientId: number;
  claimedAt: number; // the HOLDER's clock — only compared against itself
  seenAt: number; // OUR clock when the claim last changed (lease baseline)
};

export type RemoteCursor = {
  clientId: number;
  name: string;
  color: Tone;
  x: number; // world coords — rendered inside the viewport transform
  y: number;
  seenAt: number;
};

// Lease lengths: moving is continuous (every frame refreshes), so it can be
// tight; editing has natural thinking pauses between keystrokes, so evicting
// after one quiet second would fight the writer — keystrokes refresh it.
const HOLD_LEASE_MS: Record<HoldKind, number> = {
  [HoldKind.Editing]: 8000,
  [HoldKind.Moving]: 1200,
};

// Don't rebroadcast a refreshed claim more often than this (drag frames fire
// per pointer move; peers only need the lease kept alive).
const HEARTBEAT_MIN_MS = 400;

// How often lease expiry is re-evaluated (drives the reactive `now`).
const SWEEP_INTERVAL_MS = 500;

// A stale cursor fades out (peer stopped moving / left the board area).
const CURSOR_LEASE_MS = 6000;

// Cursor publish throttle — pointermove fires per frame; peers only need
// ~25 updates/s for smooth motion.
const CURSOR_MIN_INTERVAL_MS = 40;

// The shapes we publish into awareness.
type PublishedHold = { stickyId: string; kind: HoldKind; at: number };
type PublishedCursor = { x: number; y: number; at: number };

// What a peer's awareness state looks like to us (fields are set by
// collabSession ("user") and this module ("hold"/"cursor")).
type PeerState = {
  user?: Identity;
  hold?: PublishedHold | null;
  cursor?: PublishedCursor | null;
};

const awarenessByBoard = new Map<string, Awareness>();
const detachByBoard = new Map<string, () => void>();

// boardId -> stickyId -> the freshest remote claim on it
const [remoteHolds, setRemoteHolds] = createStore<
  Record<string, Record<string, RemoteHold>>
>({});

// boardId -> clientId (as string key) -> that peer's board cursor
const [remoteCursors, setRemoteCursors] = createStore<
  Record<string, Record<string, RemoteCursor>>
>({});

// Ticks while any session is attached, so lease expiry is reactive.
const [now, setNow] = createSignal(Date.now());
let sweepTimer: ReturnType<typeof setInterval> | undefined;

const ensureSweep = (): void => {
  if (sweepTimer || awarenessByBoard.size === 0) return;
  sweepTimer = setInterval(() => setNow(Date.now()), SWEEP_INTERVAL_MS);
};

const stopSweepIfIdle = (): void => {
  if (awarenessByBoard.size > 0 || !sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = undefined;
};

// The local client's in-flight hold (one gesture at a time).
type LocalHold = { boardId: string; stickyId: string; kind: HoldKind; at: number };
let localHold: LocalHold | null = null;

const rebuildBoardPresence = (boardId: string, awareness: Awareness): void => {
  const previousHolds = remoteHolds[boardId] ?? {};
  const previousCursors = remoteCursors[boardId] ?? {};
  const nextHolds: Record<string, RemoteHold> = {};
  const nextCursors: Record<string, RemoteCursor> = {};
  const localNow = Date.now();

  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return; // remote peers only
    const peer = state as PeerState;
    if (!peer.user) return;

    if (peer.hold) {
      const { stickyId, kind, at } = peer.hold;
      // an UNCHANGED claim (awareness renews resend the same state) keeps its
      // original seenAt — otherwise idle holders would never expire
      const existing = previousHolds[stickyId];
      const unchanged =
        existing && existing.clientId === clientId && existing.claimedAt === at;
      nextHolds[stickyId] = {
        stickyId,
        kind,
        name: peer.user.name,
        color: peer.user.color,
        clientId,
        claimedAt: at,
        seenAt: unchanged ? existing.seenAt : localNow,
      };
    }

    if (peer.cursor) {
      const cursorKey = String(clientId);
      const existing = previousCursors[cursorKey];
      const moved = !existing || existing.x !== peer.cursor.x || existing.y !== peer.cursor.y;
      nextCursors[cursorKey] = {
        clientId,
        name: peer.user.name,
        color: peer.user.color,
        x: peer.cursor.x,
        y: peer.cursor.y,
        seenAt: moved ? localNow : existing.seenAt,
      };
    }
  });

  setRemoteHolds(boardId, reconcile(nextHolds));
  setRemoteCursors(boardId, reconcile(nextCursors));
};

// Wire a session's awareness into presence (called by collabSession).
export const attachPresence = (boardId: string, awareness: Awareness): void => {
  if (awarenessByBoard.has(boardId)) return;
  awarenessByBoard.set(boardId, awareness);
  const apply = () => rebuildBoardPresence(boardId, awareness);
  awareness.on("change", apply);
  detachByBoard.set(boardId, () => awareness.off("change", apply));
  apply();
  ensureSweep();
};

export const detachPresence = (boardId: string): void => {
  detachByBoard.get(boardId)?.();
  detachByBoard.delete(boardId);
  awarenessByBoard.delete(boardId);
  setRemoteHolds(produce((all) => delete all[boardId]));
  setRemoteCursors(produce((all) => delete all[boardId]));
  if (localHold?.boardId === boardId) localHold = null;
  lastCursorPublish.delete(boardId);
  stopSweepIfIdle();
};

// Whether this board is in a live session (presence attached) — cheap gate for
// live-only work like the mid-drag geometry flush.
export const isPresenceLive = (boardId: string): boolean =>
  awarenessByBoard.has(boardId);

// ── local claims ──

// Claim (or keep alive) a hold on a sticky. Throttled: refreshing the same
// claim rebroadcasts at most every HEARTBEAT_MIN_MS.
export const holdSticky = (
  boardId: string,
  stickyId: string,
  kind: HoldKind,
): void => {
  const awareness = awarenessByBoard.get(boardId);
  if (!awareness) return; // board isn't in a live session — nothing to claim
  const at = Date.now();
  const sameClaim =
    localHold &&
    localHold.boardId === boardId &&
    localHold.stickyId === stickyId &&
    localHold.kind === kind;
  if (sameClaim && at - localHold!.at < HEARTBEAT_MIN_MS) return;
  localHold = { boardId, stickyId, kind, at };
  const published: PublishedHold = { stickyId, kind, at };
  awareness.setLocalStateField("hold", published);
};

// Release whatever this client holds (pointer release / editor blur).
export const releaseHold = (): void => {
  if (!localHold) return;
  awarenessByBoard.get(localHold.boardId)?.setLocalStateField("hold", null);
  localHold = null;
};

// ── local cursor ──

const lastCursorPublish = new Map<string, number>();

// Broadcast this client's board cursor (world coords). Throttled; no-op when
// the board isn't in a live session.
export const publishCursor = (boardId: string, x: number, y: number): void => {
  const awareness = awarenessByBoard.get(boardId);
  if (!awareness) return;
  const at = Date.now();
  const last = lastCursorPublish.get(boardId) ?? 0;
  if (at - last < CURSOR_MIN_INTERVAL_MS) return;
  lastCursorPublish.set(boardId, at);
  const published: PublishedCursor = { x, y, at };
  awareness.setLocalStateField("cursor", published);
};

// The pointer left the board — stop showing our cursor to peers.
export const clearCursor = (boardId: string): void => {
  awarenessByBoard.get(boardId)?.setLocalStateField("cursor", null);
  lastCursorPublish.delete(boardId);
};

// ── remote reads (enforcement inputs) ──

// A peer's UNEXPIRED hold on this sticky, if any. Reactive: re-evaluates as
// claims change and as leases tick toward expiry.
export const remoteHoldOn = (
  boardId: string,
  stickyId: string,
): RemoteHold | undefined => {
  const hold = remoteHolds[boardId]?.[stickyId];
  if (!hold) return undefined;
  const fresh = now() - hold.seenAt <= HOLD_LEASE_MS[hold.kind];
  return fresh ? hold : undefined;
};

// This client's awareness id in a board's session (tie-breaking edit races:
// the LOWER client id keeps the editor — deterministic and clock-skew-free).
export const presenceClientId = (boardId: string): number | undefined =>
  awarenessByBoard.get(boardId)?.clientID;

// Every peer's fresh cursor on a board (stale ones drop out as `now` ticks).
export const remoteCursorsOn = (boardId: string): RemoteCursor[] => {
  const cursors = remoteCursors[boardId];
  if (!cursors) return [];
  const current = now();
  return Object.values(cursors).filter(
    (cursor) => current - cursor.seenAt <= CURSOR_LEASE_MS,
  );
};
