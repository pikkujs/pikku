---
'@pikku/cli': patch
---

feat(cli): `pikku all --diff` emits a structural diff of the generated `.pikku` meta

On a successful `pikku all`, `--diff` prints a `PIKKU_DIFF <json>` line on stdout describing what the run added/removed/changed across functions, HTTP wirings, workflows (incl. userflows/scenarios), emails, schedulers, queues, channels, triggers, MCP and agents. The snapshot is taken before codegen overwrites the meta, so the diff is a couple of small JSON reads rather than a second inspection pass, and it is emitted only on exit 0 (a failed codegen produces no diff). Intended for tooling that wants to surface "what changed" after a codegen run.
