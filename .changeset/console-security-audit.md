---
"@pikku/core": patch
"@pikku/addon-console": patch
"@pikku/console": patch
---

feat(console): surface the `pikku audit` report in the dev console

Adds a view-only **Security** screen to the pikku dev console that renders the
dependency audit produced by `pikku audit` (`.pikku/audit.json`): known
vulnerabilities (severity, advisory, recommended version) and available
dependency updates.

- `@pikku/core`: exports the canonical `SecurityAuditReport` artifact type (plus
  `SecurityAuditIssue`/`SecurityAuditUpdate`/`SecurityAuditSummary` and the
  `SecuritySeverity`/`SecurityUpdateLevel` unions) — a single source of truth
  shared by the CLI (writer), the console addon (reader) and the console UI.
- `@pikku/addon-console`: `getSecurityAudit` reads the audit artifact via the
  meta service; `runSecurityAudit` triggers `pikku audit --outdated` server-side
  (regenerating the artifact) — same shape as the Run Tests action;
  `updateDependency` bumps a package in `package.json` (preserving the `^`/`~`
  range), runs `bun install`, re-audits, and returns the fresh report.
- `@pikku/console`: new `SecurityPage` with a **Run audit** button + reusable
  presentational `SecurityAuditView` (exported, so downstream consoles can wrap
  it with their own actions) + `useSecurityAudit`/`useRunSecurityAudit`/
  `useUpdateDependency` hooks. Issues/Dependencies lenses; per-finding
  remediation slot right-aligned in the row header (`renderRemediation`,
  defaulting to the OSS `UpdateDependencyButton`; Fabric swaps in its own
  sandbox-verified action). Empty state until an audit has been run.
