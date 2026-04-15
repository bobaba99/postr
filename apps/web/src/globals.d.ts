/// <reference types="vite/client" />

// Injected by vite.config.ts `define` — a short git SHA (or
// `dev-<timestamp>` locally) baked into every bundle so the
// running client can compare itself against the latest
// `/version.json` and prompt a refresh when a new deploy lands.
declare const __BUILD_ID__: string;
