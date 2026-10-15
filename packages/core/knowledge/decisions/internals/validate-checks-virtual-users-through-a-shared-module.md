---
type: decision
title: Both validators check virtual users through one shared module, and a virtual user counts from either the meta or the source
description: workspace validate and cloud validate are separate implementations, so the virtual user/virtual-user/knowledge checks live in virtual-user-checks.ts and are called by both — and a virtual user is counted from the generated meta or a defineVirtualUsers() source scan, whichever answers first
tags: cli, validate, scenarios, virtual users
---

# Both validators check virtual users through one shared module, and a virtual user counts from either the meta or the source

`pikku workspace validate` and `pikku validate` read like one command
with a flag. They are not. They are two implementations that walk the same
project and duplicate about eighteen findings between them verbatim —
`functions-dir-missing` exists twice, character for character, in two files.
Pikku Studio Cloud adds the deploy-shaped checks (themes, frontends, the Cloudflare
adapter, the `.gitignore` contract); workspace adds the local-development ones
(`dev.db`, the auth migrations).

So a check written into either one is a check half the projects never run. An
app that never deploys through cloud only ever sees workspace validate; an app
that does sees cloud validate in CI. The virtual user checks are the kind that only
pay off when nobody remembers to ask for them, which means they had to be in
both. Rather than duplicate them a nineteenth time, they live in
`virtual-user-checks.ts` and both validators call `runVirtualUserChecks`. Merging the
two validators outright is the better fix and a much larger one; this does not
block it.

**A virtual user counts from either source, and either alone is wrong at a
predictable moment.** The generated `pikku-virtual-users-meta.gen.json` is empty on
a fresh clone where codegen has not run, so trusting only it means a warning
that fires on every new checkout — and a validator that cries wolf gets muted,
after which it never says anything worth hearing. A source scan for
`defineVirtualUsers(` cannot see virtual users an addon contributed. Declared by either
counts as declared.

**Everything here is `warn`, never `error`.** A project with no virtual users is
under-tested, not broken, and `validate` gating a deploy on it would make the
first thing anyone does with the check be to remove it. `knowledge-empty` stays
at the `info` the shared `@pikku/knowledge` package already assigned it rather
than being raised to match — the severity belongs to that package.

**What this rules out:** duplicating the checks into both validators;
adding them to only one; deriving the virtual user count from the generated meta
alone; failing a build over a missing virtual user.
