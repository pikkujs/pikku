---
'@pikku/cli': patch
---

`pikku release` drops a wiring whose function is platform plumbing even when the wiring meta carries no `sourceFile`, so fabric's injected `fabric-audit` queue no longer shows up in an app's changelog.
