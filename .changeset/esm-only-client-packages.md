---
'@pikku/assistant-ui': patch
'@pikku/fetch': patch
'@pikku/websocket': patch
'@pikku/react': patch
'@pikku/paraglide': patch
'@pikku/voice-agents': patch
---

Drop the CommonJS build. These packages now ship ESM only: `exports` has no `require` condition and `main` points at `dist/esm/index.js`. Breaking change: see docs/MIGRATION.md.
