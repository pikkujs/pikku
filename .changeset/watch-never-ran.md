---
'@pikku/cli': patch
---

Keep `pikku watch` alive so it actually watches, and run one codegen pass per change

The command registered its chokidar handlers and returned, so the process exited
before `ready` ever fired and nothing was ever regenerated. It now stays alive the
way `pikku dev` does, and uses the same single-watcher, in-flight-coalescing shape,
so a change during a pass schedules exactly one more run instead of overlapping two
`ts.Program`s.
