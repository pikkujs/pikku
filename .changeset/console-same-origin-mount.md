---
'@pikku/node-http-server': patch
'@pikku/bun-server': patch
'@pikku/cli': patch
'@pikku/console': patch
---

Serve the console same-origin at /console (#861). Both dev servers gain
`staticMounts` (prefix → directory static serving with SPA fallback and path
traversal protection); `pikku serve` / `pikku dev` mount the bundled console
app at `/console` on the API port whenever it is bundled, so auth cookies are
first-party and no `?server=` param is needed. The console is built with
`base: '/console/'` (its router already derives the basename from BASE_URL).
The separate `--console <port>` static server is removed; `pikku console`
serves the bundle under /console and redirects the root there.
