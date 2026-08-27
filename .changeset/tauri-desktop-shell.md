---
'@pikku/deploy-standalone': patch
'@pikku/node-http-server': patch
'@pikku/bun-server': patch
'@pikku/deploy': patch
'@pikku/cli': patch
---

Generate a desktop shell from `pikku deploy apply --desktop`

`pikku deploy apply --provider standalone --runtime bun --desktop` now emits a
`src-tauri/` crate that ships the compiled binary as a sidecar and opens a
window on the server's own HTTP origin, so cookies, CORS and OAuth behave
exactly as they do in a browser. Regeneration is idempotent and leaves an
edited file alone rather than overwriting it.

`--desktop-url https://app.example.com` builds the other shape: a shell that
points at an already-deployed server. Nothing is bundled — no sidecar, no
binary, and so no bun runtime to compile one — and the window is declared in
`tauri.conf.json` rather than opened from Rust, because the origin is known up
front. The url can also live in `pikku.config.json` as `deploy.desktop.url`,
alongside `deploy.desktop.identifier`.

Supporting changes: `SERVER_READY_MARKER` moved to `@pikku/deploy` (the CLI
re-exports it from its old path), both HTTP runtimes expose the port they
actually bound so `--port 0` reports a real port, and the generated server
entry exits when its parent process goes away.
