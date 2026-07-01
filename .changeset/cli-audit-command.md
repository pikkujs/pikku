---
"@pikku/cli": minor
---

feat(cli): add `pikku audit` — dependency security audit written to `.pikku/audit.json`

`pikku audit` reports dependency **security advisories** (always) and, with
`--outdated`, **available dependency updates**. The normalised result is written
to `.pikku/audit.json` (the config `outDir`) so it rides the same meta pipeline
as every other generated artifact — uploaded on deploy, readable by tooling.

Bun is fully supported (`bun audit --json` + `bun outdated`, normalised into a
single `SecurityAuditReport` with per-severity/per-update-level counts). Other
package managers are detected but currently stubbed with a `note` field until
their audit/outdated shapes are normalised. The command never fails a build:
advisories are informational and a missing/failed audit yields an empty-but-valid
report.
