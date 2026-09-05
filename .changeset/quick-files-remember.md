---
'@pikku/inspector': patch
---

Keep parsed source files across inspector passes. A re-inspection in `pikku all` used to re-parse and re-bind every file, because the previous `ts.Program` — the thing TypeScript reuses parses from — had to be dropped to free its type checker. The inspector now builds each program through a compiler host with a content-hashed `SourceFile` cache, so a re-inspection parses only what codegen just wrote while holding no checker: on the 500-function benchmark the re-inspection reuses all 908 files, its CPU time falls by a third, and peak heap drops.
