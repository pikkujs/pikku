---
type: decision
title: pikku validate requires no-empty at error so an empty catch fails the app
description: An empty catch block turns a real failure into "nothing happened", so the validator requires oxlint's no-empty at error and refuses allowEmptyCatch, instead of shipping its own empty-catch scan
tags: cli, validate, lint, errors
---

# pikku validate requires no-empty at error so an empty catch fails the app

`OXLINT_REQUIRED_RULES` in `packages/cli/src/functions/validate/oxlint-checks.ts` includes `no-empty`. An empty `catch {}` turns a bad certificate, a 401 or a downed service into "nothing happened", and the caller cannot tell.

The rule only counts as on when it resolves to `error` and `allowEmptyCatch` is not `true`. `DEFEATING_OPTIONS` lists that option beside `checksConditionals: false` for `no-misused-promises`: each keeps its rule on while switching off the case it is required for. `oxlint-rule-missing` reports either one, and `pikku enable oxlint` deletes it.

A comment inside the block is how a deliberate empty catch says so; oxlint accepts it. The finding's hint says to rethrow, log or return something the caller can act on before reaching for that.

`--print-config` nests rule options one level down (`["deny", [{...}]]`) while a config file holds them flat. Before this, the `checksConditionals` check read only the flat form, so a real resolved config with it switched off passed.

**What this rules out:** a native empty-catch scan in the CLI. The Go and Rust inspectors would each need a copy, while oxlint already parses natively and is already required and run by validate. The cost is coverage: `.catch(() => {})` and `.catch(() => null)` are not empty blocks and are not reported.
