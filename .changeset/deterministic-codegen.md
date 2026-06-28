---
'@pikku/inspector': patch
---

fix(inspector): make codegen output deterministic across runs

Two sources of non-reproducible `pikku all` output are fixed:

1. **Random placeholder ids.** Anonymous/unnamed functions and inline (non-exported) permissions were given a `__temp_${randomUUID()}` id, so a referenced-but-not-exported `pikkuPermission` const (e.g. `permissions: { admin: [requiresPlatformAdmin] }`) produced a fresh UUID in the generated meta on every run. The placeholder is now derived deterministically from the call expression's source location (relative path + start offset), still `__temp_`-prefixed so downstream name resolution is unchanged.

2. **Unstable file-traversal order.** The two inspector sweeps iterated `program.getSourceFiles()` in glob + import-graph order, which varies run to run, so meta keys (and anything serialized in insertion order) were emitted in a different order each time — making a plain `git diff` of generated files look like functions were appearing/vanishing when the set was identical. Source files are now sorted by file name before the sweeps.

Net effect: byte-identical generated output across repeated runs with no source changes (verified across the full `.pikku` tree of a 331-function project).
