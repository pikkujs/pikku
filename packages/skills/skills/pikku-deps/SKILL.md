---
name: pikku-deps
description: >-
  Use for the Pikku dependency security audit: the `pikku audit` CLI command, the
  `.pikku/audit.json` artifact, the `SecurityAuditReport` type in @pikku/core, and the console
  Security screen (getSecurityAudit / runSecurityAudit / updateDependency + SecurityAuditView).
  Also covers `pikku update`, which moves the @pikku/* dependency set forward and reports the
  peers those versions need.
  TRIGGER when: user asks about `pikku audit` or `pikku update`, dependency
  vulnerabilities/advisories, outdated dependencies, upgrading Pikku itself, peer dependency
  conflicts, the Security screen/page in the console, updating a vulnerable dependency, or
  reading/rendering audit.json. DO NOT TRIGGER when: user asks about authentication/sessions/JWT
  or permissions (use pikku-auth), or secrets/env vars (use pikku-services).
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
- Package-manager detection is by **lockfile**, walking up to 12 levels to the
  workspace root, checking in this order: `bun.lock`/`bun.lockb`,
  `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`. A project with several
  lockfiles resolves as bun. Only **bun** runs a real audit (`bun audit --json` +
  `bun outdated`, normalised into one `SecurityAuditReport` with per-severity /
  per-update-level counts). Other PMs are detected but **stubbed** with a `note`
  field until their shapes are normalised — issues/updates come back empty.
- `bun audit` exits non-zero when it _finds_ advisories but still writes the
  payload to stdout, so a non-zero exit **with output** is data. A non-zero exit
  with **no** output — or a launch failure, timeout, or a blown 32MB buffer —
  throws, precisely so a failed run can't masquerade as "0 advisories".

## The `pikku update` command

Narrower than `audit --outdated`, and the only one that writes: it moves the
**@pikku/\* set** forward and reports the peers those versions need. Use `audit`
to learn a dependency is vulnerable; use `update` to move Pikku itself.

- `pikku update` — reports only. Nothing is written without `--update`.
- `pikku update --update` — writes the new ranges into every covered
  package.json, then runs an install. `--no-install` writes and stops.
- `pikku update --update-peers` — implies `--update` and additionally writes the
  ranges unsatisfied peers require, **for peers the project already declares**.
  A peer it does not declare is reported and never added — adding a dependency
  is not an update. Separate from `--update` because a peer bump can cross a
  **major** of a third-party package (`ai` 5 → 6), which is not a call to make
  on the user's behalf.
- `--tag <dist-tag>` (default `latest`) reads each package's own dist-tag, so
  `--tag next` moves the whole set onto prereleases. `--registry <url>` defaults
  to `npm_config_registry`.
- Coverage is the nearest package.json walking up from the project root, plus
  every workspace it declares — a monorepo updates in one pass. All four
  dependency fields are read, `peerDependencies` included, so an addon's own
  declared peer range moves with it.

Statuses, per dependency: `outdated` (the range floor is behind latest — this is
what `--update` writes), `stale-install` (the range already admits latest but
node_modules is behind — an install fixes it, no edit needed), `linked` (a
`workspace:`/`file:`/`link:`/`portal:` range — a deliberate local checkout,
counted but never listed), `manual` (a registry range we refuse to substitute
into: a union, an x-range, a `*`), `unresolved` (the registry had no such tag —
this must **never** read as "current", the same rule as a failed audit).

Peers are read off the version the run **lands on**, not the one installed —
the point is what the target needs. An @pikku peer the same run already brings
forward is not reported, and an unsatisfied _optional_ peer the project never
declared is skipped.

## Console integration (@pikku/addon-console)

Three RPCs, all reading/writing the same artifact via the meta service. Shared
spawn/read helpers live in `lib/audit-exec.ts` (`readAuditReport`,
`runPikkuAudit`, `spawnProcess`, `findBin`), alongside `lib/find-project-root.ts`
and `lib/resolve-package-manager.ts` (`resolvePackageManager`, `installArgs`,
`execPrefix`) — reuse them, don't re-implement. `resolvePackageManager` reads
package.json's corepack `packageManager` field first and only falls back to
lockfiles, because that field states intent before a lockfile exists and a
project can carry a stale one from another tool. Guessing wrong is not a soft
failure: the spawn dies with `Executable not found in $PATH`.
Like every console RPC these require an **authenticated session** (the console
is admin-only), so the host must have Better Auth wired — see `pikku-auth`.

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
  schemaVersion: number
  tool: string                 // e.g. 'bun'
  generatedAt: string          // ISO timestamp
  note?: string                // set when the audit could NOT run (unsupported PM);
                               // render ONLY the note — never a reassuring "no vulnerabilities"
  summary: {
    totalIssues, critical, high, moderate, low: number   // no `info` bucket
    totalUpdates, major, minor, patch: number
  }
  issues: SecurityAuditIssue[] // package, severity, title, advisoryId, url,
                               // vulnerableVersions, cwe[], cvssScore, recommendedVersion
  updates: SecurityAuditUpdate[] // package, current, latest, level (major|minor|patch|unknown)
}
```

`severity` is one of `critical | high | moderate | low | info`, but `summary`
has no `info` count — an informational advisory raises `totalIssues` without
landing in a severity bucket, so don't sum the four to get the total. On an
issue, `url`, `cvssScore` and `recommendedVersion` are always present and
**nullable** rather than optional: check for `null`, not `undefined`.

When `note` is present the audit did not run — show only the note (an "Audit not
run" state), never the "no known vulnerabilities / up to date" copy.
