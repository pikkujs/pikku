---
'@pikku/kysely': patch
'@pikku/cli': patch
---

Saving an agent's tool messages skips a tool call whose result is undefined instead of writing it. When the browser driver for a scenario cannot be loaded, the error now includes the underlying cause and tells you to `bun add -D` it.
