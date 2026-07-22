---
name: pikku-deps
description: >-
  Use for the Pikku dependency security audit: the `pikku audit` CLI command, the
  `.pikku/audit.json` artifact, the `SecurityAuditReport` type in @pikku/core, and the console
  Security screen (getSecurityAudit / runSecurityAudit / updateDependency + SecurityAuditView).
  TRIGGER when: user asks about `pikku audit`, dependency vulnerabilities/advisories, outdated
  dependencies, the Security screen/page in the console, updating a vulnerable dependency, or
  reading/rendering audit.json. DO NOT TRIGGER when: user asks about authentication/sessions/JWT
  (use pikku-security), permissions (use pikku-permissions), or secrets/env vars (use
  pikku-config).
installGroups: [core]
---

# Pikku Dependency Audit

## Agent Operating Procedure

1. The audit is a generated artifact, not live state. `pikku audit` writes the
   normalised report to `.pikku/audit.json` (config `outDir`), so it rides the
   same meta pipeline as every other codegen output — uploaded on deploy,
   readable by the console addon and any tooling. Read it via
   `metaService.readFile('audit.json')`, never by shelling out to the package
   manager from a function.
2. One source of truth for the shape: `SecurityAuditReport` (and
   `SecurityAuditIssue` / `SecurityAuditUpdate` / `SecurityAuditSummary` +
   `SecuritySeverity` / `SecurityUpdateLevel`) are exported from **@pikku/core**.
   The CLI writes it, the addon reads it, the UI renders it — never redeclare
   the type at a call site.
3. Validate with `pikku all --tsc` after changes — it type-checks and **fails on
   type errors**, like any real build gate. Separately, `pikku audit` never fails
   a build: advisories are informational, and a missing/failed audit yields an
   empty-but-valid report.

## The `pikku audit` command

- `pikku audit` — reports **security advisories** only.
- `pikku audit --outdated` — also reports **available dependency updates**.
- Package-manager detection is by **lockfile** (walks up: `bun.lock`/`bun.lockb`,
  then `yarn.lock`). Only **bun** runs a real audit (`bun audit --json` +
  `bun outdated`, normalised into one `SecurityAuditReport` with per-severity /
  per-update-level counts). Other PMs are detected but **stubbed** with a `note`
  field until their shapes are normalised — issues/updates come back empty.
- `bun audit` exits non-zero when it _finds_ advisories but still writes a valid
  report — treat any non-zero exit as data, not failure.

## Console integration (@pikku/addon-console)

Three RPCs, all reading/writing the same artifact via the meta service. Shared
spawn/read helpers live in `lib/audit-exec.ts` (`readAuditReport`,
`runPikkuAudit`, `spawnProcess`, `findBin`) — reuse them, don't re-implement.
Like every console RPC these require an **authenticated session** (the console
is admin-only), so the host must have Better Auth wired — see `pikku-better-auth`.

- `getSecurityAudit` — reads `.pikku/audit.json`, returns the report (or `null`).
- `runSecurityAudit` — runs `pikku audit --outdated` server-side (regenerates the
  artifact) then returns the fresh report. Same shape as the Run Tests action.
- `updateDependency({ package, version })` — bumps the package in `package.json`
  (preserving the `^`/`~` range prefix), runs `bun install`, re-audits, and
  returns the fresh report. Throws if the package is not a direct dependency.
  NOTE: `bun install` must be scoped to a standalone project — do not run it
  inside a yarn/bun monorepo member (it resolves the whole workspace).

## Console UI (@pikku/console)

- `SecurityPage` — the page: **Run audit** button (`lead`) + responsive
  `ShellHeader` (structured `search` + `selection` for the Issues/Dependencies
  lens; never cram raw controls into the non-collapsing `filters`/`view` escape
  hatch). Empty state until an audit has run.
- `SecurityAuditView` — exported presentational component. Two lenses
  (Issues grouped by severity; Dependencies table). Each finding row carries its
  actions **right-aligned in the row header** (`Accordion.Control` sibling, so a
  click acts instead of toggling): "View advisory" + a per-finding
  **remediation slot**.
- `renderRemediation({ pkg, version, issue })` — the extension seam. OSS default
  is `UpdateDependencyButton` (the free bump + `bun install`). Downstream
  consoles (Fabric) pass their own sandbox-verified action here — replace the
  action, keep the view.
- Hooks: `useSecurityAudit` (read), `useRunSecurityAudit` (run),
  `useUpdateDependency` (bump). All are `useMutation`/`useQuery` — surface
  `mutation.error`, never hand-roll loading/error state or swallow the error.

## Report shape (SecurityAuditReport)

```ts
{
  tool: string                 // e.g. 'bun'
  note?: string                // set when the audit could NOT run (unsupported PM);
                               // render ONLY the note — never a reassuring "no vulnerabilities"
  summary: { critical, high, moderate, low, info: number }
  issues: SecurityAuditIssue[] // package, severity, title, advisoryId, cwe[], cvssScore?,
                               // url?, vulnerableVersions, recommendedVersion?
  updates: SecurityAuditUpdate[] // package, current, latest, level (major|minor|patch|unknown)
}
```

When `note` is present the audit did not run — show only the note (an "Audit not
run" state), never the "no known vulnerabilities / up to date" copy.
