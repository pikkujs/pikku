---
type: decision
title: Single-file lint rules live in oxlint, the inspector keeps the rules that need pikku's analysis
description: lint.enforceContentService and lint.enforceVariablesService are enforced by oxlint rules pikku validate requires, not by inspector diagnostics, because a syntax-only rule in the inspector is written once per engine and never reaches the editor
tags: cli, validate, lint, inspector
---

# Single-file lint rules live in oxlint, the inspector keeps the rules that need pikku's analysis

A rule that needs only one file's syntax (an import, a `process.env` read, an empty block) is an oxlint rule. `pikku validate` requires it in the app's oxlint config and runs oxlint over `srcDirectories`. A rule that needs pikku's analysis (which call is a pikku function, wirings, types, other files) stays an inspector diagnostic with a `PKU` code.

`lint.enforceContentService` and `lint.enforceVariablesService` were `PKU412` and `PKU413`. Each inspector engine needed its own walk for them, the Rust engine never got one, and the findings only appeared in `pikku all`. They are now `OXLINT_POLICY_RULES` in `oxlint-checks.ts`: the key sets the level validate requires (`no-restricted-imports` on the four `fs` modules plus `typescript/no-require-imports`, and `node/no-process-env`), and `'off'` stops requiring them. The codes are retired, not free.

Unlike `OXLINT_REQUIRED_RULES`, a policy rule may be switched off per file in an oxlint `overrides` entry: tests, bootstrap code and scripts legitimately read the disk and the environment. `pikku enable oxlint` writes the rules with `*.test.*` and `*.spec.*` exempted.

**What this costs:** oxlint has no rule for `const { env } = process` or `globalThis.process.env`, which the inspector walk caught. A rule that needs them, or anything else built-ins cannot express, is a JS plugin, not a new inspector walk.

**What this rules out:** adding a syntax-only `PKU` diagnostic. If it can be said in an oxlint config, it goes there.
