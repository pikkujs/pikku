---
name: pikku-meta
description: >-
  Use to inspect or evolve a project you did not just write — `pikku meta` and `pikku info` for
  what the project declares (functions, schemas, wires, workflows, middleware, permissions) and
  `pikku meta apply` to change it, `pikku versions` / `pikku semver` for contract hashes,
  breaking-change detection and the semver a release should get, and `pikku audit` / `pikku
  update` for dependency advisories and moving Pikku forward. TRIGGER when: user asks what
  functions or routes exist, wants a function's input/output shape, wants to retag a function or
  set config on a declaration, asks about API versioning, breaking changes, what semver a release
  deserves, dependency vulnerabilities, the console Security screen, or upgrading Pikku. DO NOT
  TRIGGER when: user is writing a new function or wiring (use the wiring skill) or asking about
  Pikku concepts (use pikku-concepts).
installGroups: [core]
allowed-tools: Bash(yarn pikku meta *), Bash(yarn pikku info *)
argument-hint: '[context|functions|schemas|workflows|middleware|permissions|wires|apply|versions|semver|audit|update]'
---

# Pikku Project Metadata

The project already knows what it declares. Ask it rather than grepping for it,
and change it through the write path rather than by hand.

## Pick the reference

| You are… | Read |
| --- | --- |
| Asking what exists, or setting config on a declaration | `references/meta.md` |
| Versioning a contract, or deciding a release's semver | `references/versioning.md` |
| Chasing a dependency advisory, or upgrading Pikku | `references/audit.md` |

## Start with `pikku meta context`

It answers in one call what a planner needs — functions, wires, middleware,
permissions, workflows, capabilities, layout. Reach for `pikku meta` when you
are going to act on the output and `pikku info` when a person will read it;
they are the same ground in two shapes.

## Direction decides whether a change is breaking

An input is contravariant (the caller writes it) and an output is covariant (the
caller reads it), so the same edit is not the same event on both. Adding a
required field breaks an input and is compatible on an output; making a field
optional is the reverse. `pikku semver` reads the generated JSON Schemas with
that asymmetry built in, so let it decide rather than eyeballing a diff.

## What NOT to do

- **Do not infer a function's input or output by reading its body**, and do not
  cast a call site to make it compile. The schema is the type; `pikku meta
  functions get <id>` has it.
- **Do not expect an unversioned function to be promoted for you.** Without an
  explicit `version: 2` it is version 1 of its contract, collides with the
  pinned `@v1`, and `pikku versions check` reports the published contract as
  modified.
- **Do not reach for `override` by default.** The contract key already drops a
  matching `V<n>` suffix from the export name, so `getBookV1` keys under
  `getBook`. `override` is for an export that cannot follow that convention.
- **Do not shell out to the package manager from a function.** The audit is a
  generated artifact — read `.pikku/audit.json` through
  `metaService.readFile('audit.json')`.
- **Do not redeclare the audit report's shape.** `SecurityAuditReport` and its
  companions come from `@pikku/core`; the CLI writes it, the addon reads it, the
  UI renders it.
- **Do not treat a failed audit run as a clean one.** `bun audit` exits non-zero
  when it *finds* advisories and still writes its payload, so non-zero with
  output is data; non-zero with no output throws on purpose.
