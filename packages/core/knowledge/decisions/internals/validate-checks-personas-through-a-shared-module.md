---
type: decision
title: Both validators check personas through one shared module, and a persona counts from either the meta or the source
description: workspace validate and fabric validate are separate implementations, so the persona/actor/knowledge checks live in persona-checks.ts and are called by both — and a persona is counted from the generated meta or a definePersonas() source scan, whichever answers first
tags: cli, validate, scenarios, personas
---

# Both validators check personas through one shared module, and a persona counts from either the meta or the source

`pikku workspace validate` and `pikku fabric validate` read like one command
with a flag. They are not. They are two implementations that walk the same
project and duplicate about eighteen findings between them verbatim —
`functions-dir-missing` exists twice, character for character, in two files.
Fabric adds the deploy-shaped checks (themes, frontends, the Cloudflare
adapter, the `.gitignore` contract); workspace adds the local-development ones
(`dev.db`, the auth migrations).

So a check written into either one is a check half the projects never run. An
app that never deploys through fabric only ever sees workspace validate; an app
that does sees fabric validate in CI. The persona checks are the kind that only
pay off when nobody remembers to ask for them, which means they had to be in
both. Rather than duplicate them a nineteenth time, they live in
`persona-checks.ts` and both validators call `runPersonaChecks`. Merging the
two validators outright is the better fix and a much larger one; this does not
block it.

**A persona counts from either source, and either alone is wrong at a
predictable moment.** The generated `pikku-personas-meta.gen.json` is empty on
a fresh clone where codegen has not run, so trusting only it means a warning
that fires on every new checkout — and a validator that cries wolf gets muted,
after which it never says anything worth hearing. A source scan for
`definePersonas(` cannot see personas an addon contributed. Declared by either
counts as declared.

**Everything here is `warn`, never `error`.** A project with no personas is
under-tested, not broken, and `validate` gating a deploy on it would make the
first thing anyone does with the check be to remove it. `knowledge-empty` stays
at the `info` the shared `@pikku/knowledge` package already assigned it rather
than being raised to match — the severity belongs to that package.

**What this rules out:** duplicating the checks into both validators;
adding them to only one; deriving the persona count from the generated meta
alone; failing a build over a missing persona.
