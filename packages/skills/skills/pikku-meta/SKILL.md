---
name: pikku-meta
description: >-
  Inspect or evolve an existing project: `pikku meta`/`info` (functions, schemas, wires), `pikku versions`/`release` (breaking changes, semver), `pikku audit`/`update` (vulnerabilities, upgrades).
installGroups: [core]
allowed-tools: Bash(yarn pikku meta *), Bash(yarn pikku info *)
argument-hint: '[context|functions|schemas|workflows|middleware|permissions|wires|apply|versions|release|audit|update]'
---

# Pikku Project Metadata

The project already knows what it declares. Ask it rather than grepping for it,
and change it through the write path rather than by hand.

## Pick the reference

| You are…                                                    | Read                       |
| ----------------------------------------------------------- | -------------------------- |
| Asking what exists, or setting config on a declaration      | `references/meta.md`       |
| Versioning a contract, or versioning and shipping a release | `references/versioning.md` |
| Chasing a dependency advisory, or upgrading Pikku           | `references/audit.md`      |

## Start with `pikku meta context`

Never run bare `pikku meta`: it regenerates the project, then prints only usage. `pikku meta context` is the first call, and it prints the whole document (functions, wires, middleware, permissions, workflows, `capabilities`, `layout`; tens of KB) as one line of JSON, so `head` cuts it mid-object. Add `--json` and filter it with `jq` (`pikku meta context --json | jq '.functions[] | select(.id | test("cancel"; "i")) | {id, description, sourceFile}'`), or save it once and query the file. `pikku meta functions list` is the lighter list of ids and descriptions, and `pikku meta functions get <id>` has the schemas.

`pikku meta db [table]` answers the table question. `grep`, `screens`, `services` and `emails` exist only on a CLI whose `pikku meta` usage lists them; the current release does not, so call a name only after you have seen it listed, and fall back to `context --json` and `pikku info`.

It answers in one call what a planner needs — functions, wires, middleware,
permissions, workflows, capabilities, layout. Reach for `pikku meta` when you
are going to act on the output and `pikku info` when a person will read it;
they are the same ground in two shapes.

## Tables: `pikku meta db`

`pikku meta db` (also the `db` block of `pikku meta context`) says where the
project declares its tables, which ones it declares, where their generated types
are, and the commands that make the SQL. There is no migrations path in it,
because you don't need one: change the declaration and run `pikku db generate`.

## Direction decides whether a change is breaking

An input is contravariant (the caller writes it) and an output is covariant (the
caller reads it), so the same edit is not the same event on both. Adding a
required field breaks an input and is compatible on an output; making a field
optional is the reverse. `pikku release diff` reads the generated JSON Schemas with
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
  when it _finds_ advisories and still writes its payload, so non-zero with
  output is data; non-zero with no output throws on purpose.
