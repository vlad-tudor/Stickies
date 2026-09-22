// Preload for the `test:idb` project ONLY. Registers fake-indexeddb on top of
// the happy-dom globals from setup.ts, so `canPersistDocs` — a module-level
// `typeof indexedDB !== "undefined"` in docPersistence — evaluates TRUE.
//
// This is why IDB tests get their own project rather than a flag: bun runs a
// project's files in one process and that const is read once at import, so
// registering the shim anywhere would silently turn persistence on for every
// other suite too.
import "fake-indexeddb/auto";
