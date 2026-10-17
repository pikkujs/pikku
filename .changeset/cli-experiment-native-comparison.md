---
'@pikku/cli': patch
---

`pikku experiment native-comparison` runs a project's codegen (`pikku all`) with the TypeScript inspector and then the native one, each from the same `.pikku` state, and prints them side by side: wall time, CPU time across the process tree, peak memory per process and for the whole tree (RSS everywhere, plus the kernel's physical footprint on macOS), and whether the two engines generated identical output, listing the files that differ when they did not. `--runs N` reports the median of N runs per engine; `--json` emits the full result. The project's `.pikku` directories and `*.gen.*` files are put back as they were before each run and when it finishes.
