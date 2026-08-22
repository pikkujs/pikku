---
'@pikku/cli': patch
---

Run one codegen pass per file change in `pikku dev`, not two

`configWatcher` watched the source directories and rebuilt the file watcher on
every change, whose `ready` handler immediately ran a full codegen — while the
old watcher's own `change` handler ran another. Each pass holds a whole
`ts.Program`, so the two overlapping passes doubled peak RSS and could OOM a
memory-capped sandbox. There is now a single long-lived watcher, and changes
arriving mid-pass coalesce into exactly one follow-up run.
