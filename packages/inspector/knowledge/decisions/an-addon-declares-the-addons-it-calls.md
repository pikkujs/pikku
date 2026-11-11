---
type: decision
title: An addon declares the addons it calls in package.json, and the app's uses may map only those
description: pikku.uses in an addon's package.json names each addon it calls by alias and package@range; the inspector refuses a wireAddon that leaves one unmapped (PKU348), maps it to another package (PKU347) or maps a name the addon never declared (PKU355), and a malformed entry is PKU356
tags: [inspector, addon, security]
---

# An addon declares the addons it calls in package.json, and the app's uses may map only those

An addon names the addons it calls under `pikku.uses` in its own
`package.json`, in one of two forms (`utils/addon-dependencies.ts`):

- `{ "stripe": "@pikkustudio/addon-stripe@^0.12.0" }`: an alias, the package
  and a range. The addon calls `stripe:*`, and its `pikku all` types those
  calls from the package's SDK.
- `["kysely"]`: the older list. Each name is a key the app has to map, with no
  package or version attached.

`recordDeclaredUses` (`utils/load-addon-functions-meta.ts`) reads it when the
app loads the addon's meta, and records `declaredUses` (the names, either form)
and `dependencies` (the map form) on the `wireAddon` declaration.
`validateAddonUses` (`utils/post-process.ts`) then checks every mapping.

| Code   | Refuses                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ |
| PKU348 | a declared name the app's `uses` does not map                                              |
| PKU347 | a mapping to a name that is not wired, or wired from another package than the one declared |
| PKU355 | a `uses` key the addon did not declare                                                     |
| PKU356 | an alias that is not an identifier, a value that is not a string, or a spec with no range  |

**Why package.json and not pikku.config.json.** The app reads the addon from
`node_modules`, where pikku.config.json is not published. package.json is also
where the list form already lived, so the map form extends a field apps
already read rather than adding one.

**Why the alias is the `uses` key.** `uses` already mapped "the name the addon
calls" to "the name the app wired". Before, the two were usually the same
string; the alias makes the left side the addon's choice and the right side
the app's, which is what lets two apps wire the same addon under different
names without the addon changing.

**Why PKU347 and PKU348 are reused.** They already meant "not mapped" and
"mapped to the wrong thing" for the list form. A new code for the same refusal
in a new syntax would split one rule across two codes.

**Why PKU355 fails closed.** A key the addon never declared is reach the addon
did not ask for. Accepting it would let an app widen what third-party code can
call by accident. It applies only to an addon that declares `pikku.uses`, so
addons that declare nothing keep working; it is listed in docs/MIGRATION.md.

**Why the version check is not here.** The inspector has no semver; ranges are
checked in the CLI (PKU354, `packages/cli/src/utils/addon-dependencies.ts`),
which already reads the lock and the installed packages.

The Go port mirrors this in `internal/visit/addon_dependencies.go` and
`internal/finalize/addons.go`; `testdata/wirings-addons` pins the messages.

**What this rules out:** an addon reaching an addon the app mapped without it
asking; an app silently wiring a different package under the alias an addon
calls; and an addon's dependency being declared anywhere a consumer cannot
read it.
