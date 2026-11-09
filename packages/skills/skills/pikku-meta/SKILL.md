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

`pikku meta context` is the first call. It prints a short map and no JSON: tables, workflows, permissions, middleware, emails, wire counts, screens, what the project says about itself (agent runner and model aliases, locales and how to add a key, the generated client's import, where routes, shell, nav and UI components are), then one line per function (id, `x` exposed, `r` readonly, a few words). Read it whole; it is about 12 KB for 165 functions. `pikku meta` alone only lists the subcommands and exits 1, so skip it.

Then ask the narrower question instead of opening files:

- `pikku meta grep <terms>`: everything the project knows, grouped by kind (functions, workflows, wires, tables and columns, screens, services, emails, translations in every locale, model aliases). Word-aware and any term may match: `invit` finds `invitation`, `'a|b'` means either.
- `pikku meta db <table>`: column types. `pikku meta screens`, `services`, `emails`: routes with the RPCs each page reaches, session fields and services, email templates with their data.
- `pikku meta context --json` is the full planner document (about 75 KB for the same app). Filter it with `jq` (`pikku meta context --json | jq '.functions[] | select(.id | test("cancel"; "i")) | {id, description, sourceFile}'`), never `head`. `pikku meta functions get <id>` has one function's schemas.

Reach for `pikku meta` when you are going to act on the output and `pikku info` when a person will read it; they are the same ground in two shapes.

## Tables: `pikku meta db`

`pikku meta db` (also the `db` block of `pikku meta context --json`) says where the
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
