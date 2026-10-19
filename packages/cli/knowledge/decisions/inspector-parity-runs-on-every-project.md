---
type: decision
title: Inspector parity runs on every example, template and verifier
description: pikku inspector parity runs codegen with both inspectors and fails unless the saved state, the generated files and the diagnostics match; CI runs it on every project in the repo, so a fix covered by a verifier is covered for both engines
tags: [cli, inspector, inspector-go, parity, testing]
---

# Inspector parity runs on every example, template and verifier

`pikku inspector parity` runs `pikku all` with the TypeScript inspector and
then the native one, each from the same generated state, and fails unless both
save the same inspector state (`--stateOutput`, timings aside), generate the
same files (`pikku all`'s own run records aside) and log the same `[PKU…]`
diagnostics.

`scripts/inspector-parity.mjs` runs it on every directory under `templates/`,
`recipes/` and `verifiers/` with a `pikku.config.json`, nested ones included,
and CI runs that in four shards on every pull request.

A fix to the TypeScript inspector already lands with a verifier (the PR
checklist asks for one). Because parity runs on that verifier, the same PR
fails until the native inspector produces the same state, so a behaviour
cannot be fixed in one engine and silently missed in the other, as
`addGlobalPermission` was (#2148).

A project is skipped only when its codegen fails and
`scripts/inspector-parity-skip.json` says why; an entry for a project that
passes fails the run until it is removed.

```decision
chosen: A CLI command that compares both engines' saved state and generated files, run by CI on every example, template and verifier.
rules-out:
  - A separate corpus of input files and expected state for the two engines
  - Comparing on a fixed pair of projects
  - Keeping the comparison inside @pikku/inspector-go, which owns only one of the engines
because: Verifiers are already where a fix proves itself on a real project, and
  the CLI is what runs both engines; a second corpus would have to be kept in
  step with the verifiers by hand.
```
