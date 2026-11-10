---
type: decision
title: lint.strict is an opt-in oxlint preset that validate requires only while it is true
description: pikku enable oxlint --strict merges built-in oxlint 1.88 rules, a workflow no-await-in-loop override and a test-file no-floating-promises override, and sets lint.strict; validate then reports oxlint-strict when the preset is missing
tags: cli, validate, lint, oxlint
---

# lint.strict is an opt-in oxlint preset that validate requires only while it is true

**Opt-in, default false.** The preset was measured against the starter, field-service, online-shop, lab and `verifiers/functions`; the error rules are the ones with real bugs behind their hits (forgotten awaits, throws of non-errors), the warn rules are the ones with many legitimate hits. A project that sets nothing is unchanged.

**One boolean, mirroring the `enforce*` keys.** `lint.strict: true` makes `pikku validate` read the resolved `oxlint --print-config` and report `oxlint-strict` (one finding, every gap listed) when a preset rule is below its level (`error` needs error, `warn` needs warn or error) or the `typescript`, `unicorn` or `import` plugin is absent. `OXLINT_STRICT_RULES` in `oxlint-checks.ts` is the single list; `pikku enable oxlint --strict` merges it and writes the key. A project that already set the key keeps the preset on a plain `pikku enable oxlint`. Rules the preset sets to `off` are documented and written when absent but never validated, and the preset never lowers a rule the user set higher.

**Built-in rules only.** oxlint 1.88 has no JS plugins, so nothing Pikku-specific (for example a `workflow.do` rule) is possible; verified with `oxlint --rules` that every rule exists and which need the `import` plugin (`import/no-cycle`) or type information (the `typescript/*` ones, already run with `--type-aware`).

**Off because they conflict with Pikku:** `require-await` (a Pikku function is `async` by contract), `import/no-default-export` and `oxc/no-barrel-file` (generated output, `index.ts`), `no-param-reassign` (middleware mutates the wire), `import/no-unassigned-import` (generated side-effect imports). Pedantic style rules are not enabled.

**Loops: `for...of` stays.** `no-await-in-loop` is a warning, off in `**/*.workflow.ts` by an `overrides` entry because `for...of` with `workflow.do` is the DSL's durable sequential fanout. Elsewhere the finding points at `mapConcurrent` (`@pikku/core/utils`, no dependency, in-order, fail fast, abortable) or a reasoned inline disable. `mapConcurrent` is not for a `pikkuWorkflowFunc` body, whose steps must be recorded by `workflow.do`; bounded concurrency in the workflow fanout is a separate future change. A workflow function in a `*.functions.ts` file is not covered by the glob and uses the inline disable.

**The test-file override is the one exception to "required rules stay at error".** `describe`, `test` and `it` return promises nobody awaits, so `typescript/no-floating-promises` is off for `**/*.assert.ts`, `**/*.verify.ts` and `*.test.*` / `*.spec.*` (the exact glob list in `OXLINT_STRICT_TEST_FILES`). Validate accepts that override only when `lint.strict` is true and only when every glob of the override is in that list; any other override of a required rule is still reported.

**create-pikku does not offer the flag.** It writes the same non-strict config as `pikku enable oxlint`; the parity test stays green. A new app opts in with `pikku enable oxlint --strict`.

Builds on [The four code-policy lint keys share two oxlint rules](code-policy-lint-keys-share-two-oxlint-rules.md).
