---
'@pikku/core': patch
---

Fix `pikku dev` hot-reload memory leak (#975). Changed user files were re-imported under a fresh URL on every reload (a `data:` URL on Node, a uniquely-named temp sibling on Bun), which permanently leaked a record in the native ESM loader map — the dev server climbed to `JavaScript heap out of memory` during long editing sessions (worse on Bun, which the sandbox dev server runs on). Reloading now goes through an evictable module runner that transpiles the source and runs it via `vm.compileFunction`, holding exports under a stable path key so each edit overwrites one slot and the previous module is collected. Heap stays bounded on both runtimes.
