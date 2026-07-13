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

// The shape we publish into awareness under the "hold" field.
type PublishedHold = { stickyId: string; kind: HoldKind; at: number };

// What a peer's awareness state looks like to us (fields are set by
// collabSession ("user") and this module ("hold")).
type PeerState = { user?: Identity; hold?: PublishedHold | null };

const awarenessByBoard = new Map<string, Awareness>();
const detachByBoard = new Map<string, () => void>();

// boardId -> stickyId -> the freshest remote claim on it
const [remoteHolds, setRemoteHolds] = createStore<
  Record<string, Record<string, RemoteHold>>
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

const rebuildBoardHolds = (boardId: string, awareness: Awareness): void => {
  const previous = remoteHolds[boardId] ?? {};
  const next: Record<string, RemoteHold> = {};
  const localNow = Date.now();

  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return; // remote peers only
    const peer = state as PeerState;
    if (!peer.hold || !peer.user) return;
    const { stickyId, kind, at } = peer.hold;
    // an UNCHANGED claim (awareness renews resend the same state) keeps its
    // original seenAt — otherwise idle holders would never expire
    const existing = previous[stickyId];
    const unchanged =
      existing && existing.clientId === clientId && existing.claimedAt === at;
    next[stickyId] = {
      stickyId,
      kind,
      name: peer.user.name,
      color: peer.user.color,
      clientId,
      claimedAt: at,
      seenAt: unchanged ? existing.seenAt : localNow,
    };
  });

  setRemoteHolds(boardId, reconcile(next));
};

// Wire a session's awareness into presence (called by collabSession).
export const attachPresence = (boardId: string, awareness: Awareness): void => {
  if (awarenessByBoard.has(boardId)) return;
  awarenessByBoard.set(boardId, awareness);
  const apply = () => rebuildBoardHolds(boardId, awareness);
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
  if (localHold?.boardId === boardId) localHold = null;
  stopSweepIfIdle();
};

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
