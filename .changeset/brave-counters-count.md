---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Report what each inspector pass did, not only how long it took. `inspect()` now records per-pass work counters on the state (`stats`: files in the program, files reused from the previous program, type/instantiation/symbol counts, CPU and wall time, heap in use), and `pikku all` prints one `[INSPECT]` row per pass under `PIKKU_TIMING`. The codegen benchmark gates on those counts and on live heap per pass instead of on step timings, which swing with the runner, and its fixture now includes an agent so the post-agent re-inspection is actually exercised.
