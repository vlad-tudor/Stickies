// bun test preload: give the store modules the browser globals they expect
// (localStorage, window.location, event listeners) before they're imported.
// A real URL so history.replaceState (clearHash) works.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });
