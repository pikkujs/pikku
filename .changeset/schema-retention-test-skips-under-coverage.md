---
'@pikku/inspector': patch
---

Skip the schema-generator retention assertion under `--coverage`. Coverage
instrumentation keeps per-line counters alive for the life of the run, so the
heap delta cannot discriminate a retained `ts.Program` from accumulated
counters, and `Unit Coverage` failed intermittently while `Unit Tests` passed on
the same commit. Matches the existing guard in `module-runner.test.ts`.
