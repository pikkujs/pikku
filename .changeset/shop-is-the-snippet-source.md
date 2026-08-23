---
'@pikku/cli': patch
'@pikku/core': patch
---

Every `@example` in the public surface now names a snippet from `examples/online-shop`,
and `@pikku/cli` ships the regions themselves as `snippets.json` beside `surface.json`.

One running application is the only source: the code a reader is shown is code that
compiles, migrates and passes `pikku` in CI, and it cannot drift from the API it
illustrates. 80 of the 85 app-entrypoint callables now carry an example, up from 34.
