---
'@pikku/cli': patch
'@pikku/skills': patch
---

A pikku config that `extends` another now merges into it instead of replacing whole fields: objects merge key by key, `srcDirectories` appends the child's entries to the parent's (duplicates dropped), any other array or value the child sets replaces the parent's, and `null` removes a parent value. Paths are resolved relative to the file that declares them, output files are derived from the merged `outDir`, and an `extends` cycle is refused instead of recursing forever.
