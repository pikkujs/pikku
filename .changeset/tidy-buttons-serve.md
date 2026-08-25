---
'@pikku/node-http-server': patch
'@pikku/deploy-standalone': patch
'@pikku/bun-server': patch
'@pikku/deploy': patch
'@pikku/cli': patch
---

feat: serve a built frontend from the pikku server's own origin

A new `frontend` key in `pikku.config.json` names a directory of built
frontend output. `pikku serve` mounts it, and `pikku deploy` ships it inside
the distributable — into a directory beside the bundle for the node runtime,
and embedded in the binary for a `bun build --compile` standalone. `pikku dev`
deliberately ignores it and says so, because the frontend's own dev server owns
that job.

Pikku reads the frontend's output and never builds it, so an unbuilt directory
fails with a message that says which build to run rather than booting a server
that answers every page with a 404.
