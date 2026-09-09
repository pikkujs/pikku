---
'@pikku/cli': patch
---

The `--tsc` / `--tsc-summary` gate now runs the project's own `tsc` binary instead of loading its `typescript` module and driving the compiler API. TypeScript 7 ships a compiler binary but no importable API, so the old code crashed on any project that had upgraded; shelling out works the same on 5, 6 and 7.

Full output is now a plain line per diagnostic rather than a colour-highlighted code frame.
