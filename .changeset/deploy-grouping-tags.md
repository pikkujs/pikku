---
'@pikku/cli': patch
---

fix(deploy): read tags from wirings, and keep the server container's queues wired

`deploy.grouping` and every unit's `tags` field read `FunctionMeta.tags`, but
tags are written on the wiring — `wireHTTP({ tags: [...] })` — so in a typical
project they were empty and a `tags` rule matched nothing. The analyzer now
unions a function's own tags with those of every wiring that reaches it.

Separately, folding server units into `pikku-server-container` left
`queues[].consumerUnit`, `scheduledTasks[].unitName` and `dependsOn` pointing at
the unit names it had just removed. The merge rewrites them.
