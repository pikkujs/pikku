---
'@pikku/cli': patch
---

Tag every scaffold/plumbing wiring with `pikku` so visualizers (e.g. the
console's woven build view) can tell built-in pieces apart from the user's app.
Previously the better-auth catch-all routes + handler, the console
`/workflow-run` route group, the graph-starter workflow route + function, and
the public/remote RPC HTTP routes (and the remote-RPC queue worker) emitted with
no `pikku` tag, so anything filtering on the tag missed them.
