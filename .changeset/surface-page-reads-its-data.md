---
'@pikku/addon-console': patch
'@pikku/console': patch
---

Serve the public surface to the console. `console:getSurface` reads the doc
shipped inside `@pikku/cli` and the usage the inspector measured into the
project's outDir, each half optional, and `/surface` renders it from
`useSurface()`. Both files are read on demand when the page asks, never at boot.
