---
'@pikku/cli': patch
---

A generated CLI-over-channel client imports `@pikku/websocket`; the CLI now declares it in the package that owns the client file when that package doesn't already list it.
