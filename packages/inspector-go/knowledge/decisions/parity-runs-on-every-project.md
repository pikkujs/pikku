---
type: decision
title: Parity runs on every example, template and verifier
description: The two engines are compared on every project in the repo, so a fix covered by a verifier is covered for the Go inspector too; there is no separate engine test corpus
tags: [inspector-go, parity, testing]
---

# Parity runs on every example, template and verifier

`parity/parity.ts --generate` compares the Go inspector with the TypeScript
reference on every directory under `examples/`, `templates/` and `verifiers/`
with a `pikku.config.json`, nested ones included. CI runs it in four shards on
every pull request.

A fix to the TypeScript inspector already lands with a verifier (the PR
checklist asks for one). Because parity inspects that verifier, the same PR
fails until the Go inspector produces the same state, so a behaviour cannot be
fixed in one engine and silently missed in the other, as `addGlobalPermission`
was (#2148).

A project the reference cannot inspect is skipped only when
`parity/skip-projects.json` lists it with a reason, and an entry that stops
being needed fails the run until it is removed.

```decision
chosen: Compare both engines on every example, template and verifier, generated first.
rules-out:
  - A separate corpus of input files and expected state for the two engines
  - Comparing on a fixed pair of projects
because: Verifiers are already where a fix proves itself on a real project;
  a second corpus would have to be kept in step with them by hand.
```
