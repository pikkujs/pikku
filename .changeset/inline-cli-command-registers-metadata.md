---
'@pikku/inspector': patch
---

A `func` written inline in a `wireCLI` command now registers its function metadata under `cli:<program>:<command path>`, with `sessionless` taken from the helper it was built with. Before, the command pointed at an id nothing had registered. An inline channel `onMessage` still fails the build with the named "No function metadata found" error, and a test now pins that.
