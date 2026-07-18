---
"@pikku/assistant-ui": patch
---

Replace the hand-rolled SSE parser with the AG-UI client runtime (`@ag-ui/client` + `@assistant-ui/react-ag-ui`); agent chat is now streaming-only, with the approval/resume flow preserved.
