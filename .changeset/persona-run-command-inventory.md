---
'@pikku/skills': patch
---

Cover `pikku persona run`, and give the corpus a CLI command inventory.

`pikku doc` computes the `#pikku/*` API surface and lists no CLI commands, so
for anything invoked as `pikku <cmd>` the skills corpus is the only place it
exists. Two things were missing from it.

`pikku-scenario` covered declaring personas but not running one. Its new
`references/persona-run.md` covers the virtual-user run: the seven dispositions
and what each one is for, the three credentials and which wins, the budget and
`--seed` replay, why production takes only `accountable` and why that rule is
checked at build time and again at sign-in, the role check that happens before
the first step, and `sync` / `list` / `secret`.

`pikku-concepts` gains a one-line-per-command inventory of the CLI, grouped by
what you are doing and pointing at the skill that teaches each one. A dash means
no skill covers it beyond that line, which is a reason to read `--help` rather
than assume the command does what its name suggests.
