---
'@pikku/cli': patch
---

Pin `@pikku/node-http-server` in the CLI bootstrap

The bootstrap installs published `@pikku/*` packages into a temp directory to run
codegen, and pinned only `@pikku/core`. `@pikku/node-http-server` arrived
transitively through the CLI's `^0.12.7`, so it floated to the newest release
while the pin held core still. When a release wave published node-http-server
0.12.8 — which imports `@pikku/core/node-host-resolver` — one second before core
0.12.79, the first core to export that subpath, every bootstrap died on a missing
export in a package the pin never named.
