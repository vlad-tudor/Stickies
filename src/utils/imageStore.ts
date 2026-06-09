// IndexedDB blob store for images + a session cache of object URLs. Images are
// kept OUT of the board JSON (localStorage) — which has a ~5MB cap and would need
// base64 (+33%) — so the board holds only an id ref and resolves it to an object
// URL at render time. This blob-out-of-band / ref-in-doc shape also survives the
// Phase 7 CRDT swap and feeds the Phase 8 archive.

const DB_NAME = "stickies-images";
const STORE = "images";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// object URLs are expensive to recreate and stable for the session — cache by id
const urlCache = new Map<string, string>();

export async function putImage(blob: Blob): Promise<string> {
  const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await run("readwrite", (s) => s.put(blob, id));
  return id;
}

export async function getImageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await run<Blob | undefined>("readonly", (s) => s.get(id));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function deleteImage(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  await run("readwrite", (s) => s.delete(id));
}
