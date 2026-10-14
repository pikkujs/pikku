---
'@pikku/cli': patch
---

`pikku dev` and `pikku serve` no longer build a TypeScript program inside the long-lived server process. Codegen and inspection run in a child `pikku` process that writes the inspector state with `--stateOutput`, and the server reads that file, so the program's memory goes back to the OS when the child exits. On the starter template this takes `dev` from about 520-600 MB to about 130 MB and `serve` from about 520 MB to about 120 MB. `pikku dev` also no longer repeats the whole codegen pass when the watcher becomes ready, unless a source file changed while it was starting.
