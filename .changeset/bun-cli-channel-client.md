---
'@pikku/cli': patch
---

fix(cli): pick the CLI channel client's WebSocket by runtime, and fix the direct-execution check

The generated CLI-over-channel client always reached for the `ws` module when it had credentials to send, because Node's global `WebSocket` reads its second argument as subprotocols and silently drops custom headers. Bun's honours them, so it now uses the native `WebSocket` there and never loads Bun's `ws` compatibility shim. The runtime is detected once, the same way the CLI picks its dev-server runner.

Both generated CLI entrypoints also guarded direct execution by comparing `import.meta.url` against a hand-built `file://` path from `process.argv[1]`. That is false for any CLI invoked through a symlinked `node_modules/.bin/<name>` — Node reports the symlink in argv and the realpath in the URL — so the block never ran. It also failed on paths needing percent-encoding, such as one containing a space. Both now use `import.meta.main`, falling back to a realpath comparison on Node before 24.2.
