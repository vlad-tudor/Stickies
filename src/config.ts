// Root portfolio site the "by Tudor-Vlad" credit links to. Hardcoded to match the
// Klonk app's byline — a fixed brand URL that doesn't vary by environment.
export const PORTFOLIO_URL = "https://vlados.co.uk";

// Collab relay endpoint — an environment boundary (.env convention: the value
// changes when the surrounding infra does). Build-time via Vite; production
// sets VITE_COLLAB_WS_URL=wss://collab.<domain>, dev falls back to the local
// relay (`bun run relay`).
export const COLLAB_WS_URL: string = import.meta.env.VITE_COLLAB_WS_URL ?? "ws://localhost:1234";
