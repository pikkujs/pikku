# Pikku Dependency Audit

## Contents

- [Agent Operating Procedure](#agent-operating-procedure)
- [The `pikku audit` command](#the-pikku-audit-command)
- [The `pikku update` command](#the-pikku-update-command)
- [Report shape (SecurityAuditReport)](#report-shape-securityauditreport)

## Agent Operating Procedure

1. The audit is a generated artifact, not live state. `pikku audit` writes the
   normalised report to `.pikku/audit.json` (config `outDir`), so it rides the
   same meta pipeline as every other codegen output — uploaded on deploy,
   readable by any tooling. Read it via
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
  declared peer range moves with it. `overrides` and `resolutions` move too —
  an override left behind pins the old version over the new range. A nested
  override (an object, not a version) is left alone.

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
