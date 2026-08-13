// Per-board Y.Doc persistence via y-indexeddb: the doc's UPDATE LOG survives
// reloads, so a reload resumes the SAME CRDT history — a session can reconnect
// and merge instead of colliding two rebuilt histories of the same notes.
// Feature-detected: environments without IndexedDB (tests) silently skip it and
// the store falls back to seeding docs from the JSON snapshot.
import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

const DB_PREFIX = "stickies-doc-";

// Whether doc persistence is available here. When false (tests), the store
// seeds docs from the JSON snapshot instead of hydrating from IndexedDB.
export const canPersistDocs = typeof indexedDB !== "undefined";

const providers = new Map<string, IndexeddbPersistence>();

// Attach IDB persistence to a board's doc. `onSynced` fires once the stored
// update log has been applied (the moment to decide whether the doc still
// needs seeding from the JSON snapshot).
export function attachDocPersistence(boardId: string, doc: Y.Doc, onSynced?: () => void): void {
  if (!canPersistDocs || providers.has(boardId)) return;
  const provider = new IndexeddbPersistence(`${DB_PREFIX}${boardId}`, doc);
  providers.set(boardId, provider);
  if (onSynced) provider.once("synced", onSynced);
}

// Detach without touching stored data (doc teardown on reload/reset).
export function detachDocPersistence(boardId: string): void {
  providers.get(boardId)?.destroy();
  providers.delete(boardId);
}

// Detach AND delete the stored update log (board deletion).
export function clearDocPersistence(boardId: string): void {
  const provider = providers.get(boardId);
  providers.delete(boardId);
  if (provider) {
    void provider.clearData(); // also destroys the provider
  } else if (canPersistDocs) {
    // board wasn't hydrated this session (defensive) — drop the DB directly
    indexedDB.deleteDatabase(`${DB_PREFIX}${boardId}`);
  }
}
