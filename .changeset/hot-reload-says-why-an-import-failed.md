---
'@pikku/core': patch
---

Say why a hot-reload import failed instead of only that it did.

The dev module runner caught every failure bare and returned `null`, and the reloader turned that into a single line: `Failed to import: … (keeping old code)`. Keeping the old code is the right call, but it leaves the running process disagreeing with the file on disk, and the only symptom is a function returning stale output while the editor shows the new source — `tsc` passes, every import resolves, and there is nothing anywhere to explain it.

`run` now returns `{ ok: true, exports }` or `{ ok: false, error }`, so the failure case cannot be read past, and the reloader prints the error's message and stack under the existing line. A failure matching pikku's own documented limitation — a file using top-level `await`, which the `cjs` emit cannot express — says so outright, because in that case nothing is wrong with the file and re-reading it will never reveal that.
