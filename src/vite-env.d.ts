/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  // collab relay endpoint (ws:// or wss://); defaults to the local dev relay
  readonly VITE_COLLAB_WS_URL?: string;
}
