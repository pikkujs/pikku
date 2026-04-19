---
'@pikku/cli': minor
---

Add `pikku dev` command: an all-in-one local development server that wires
an HTTP + WebSocket server with in-memory scheduler, queue, workflow,
trigger, and AI run-state services. Supports file watching with
regeneration and hot module reload.

Options:
- `--port, -p` (default `3000`)
- `--watch` (default `true`)
- `--hmr` (default `true`)
