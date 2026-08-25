---
'@pikku/deploy-standalone': patch
'@pikku/node-http-server': patch
'@pikku/bun-server': patch
'@pikku/deploy': patch
'@pikku/cli': patch
---

Generate a Tauri desktop shell from `pikku deploy apply --tauri`

`pikku deploy apply --provider standalone --runtime bun --tauri` now emits a
`src-tauri/` crate that ships the compiled binary as a sidecar and opens a
window on the server's own HTTP origin, so cookies, CORS and OAuth behave
exactly as they do in a browser. Regeneration is idempotent and leaves an
edited file alone rather than overwriting it.

Supporting changes: `SERVER_READY_MARKER` moved to `@pikku/deploy` (the CLI
re-exports it from its old path), both HTTP runtimes expose the port they
actually bound so `--port 0` reports a real port, and the generated server
entry exits when its parent process goes away.
