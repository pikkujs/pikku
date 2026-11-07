---
'@pikku/cli': patch
'@pikku/skills': patch
'create-pikku': patch
---

`pikku dev` without `--port` now listens on the port in the local environment's `apiUrl` (the non-production loopback environment, `local` preferred), falling back to 3000; an explicit `--port` still wins and a non-numeric one is refused. The `pikku` bin re-runs itself on bun when Node is older than 24 (which has no `node:sqlite`), and exits with a message naming both fixes when bun is not installed, so `bunx --bun` is no longer needed. The starter's `scripts/dev.mjs` is gone: its `dev` script is plain `pikku dev`, which already loads `.env`, generates the local secrets and starts every frontend. Behaviour change for a project whose local `apiUrl` names a port other than 3000 and that ran `pikku dev` without `--port`: it now binds the apiUrl's port.
