---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
---

Let a persona do a real job in production, and say where it may act.

A persona was only ever a test subject: something you pointed at a stage to find
out what the product does wrong. But the same declaration — a name, a job, the
roles it holds and what it is trying to get done — describes a teammate doing
the work for real, and nothing about the engine cared which one it was.

Four changes make that difference explicit and enforced.

**`environments` moves to the top level of `pikku.config.json`**, out from under
`scenarios`. It was never a scenario's anything: `persona run` targets one, and
now so does `persona sync`. An environment may be flagged `production: true` —
a flag rather than a reserved name, because projects call it `prod`, `live` or
`eu-prod`, and more than one environment can be production.

**A persona may name its `environments`.** Omitting them means every configured
environment *except* the production ones, so nothing reaches production by being
forgotten. Naming a production environment requires `disposition: 'accountable'`.
The rule is checked twice, on purpose: the inspector refuses to generate a
declaration that breaks it, and sign-in re-checks against the environment
actually resolved — the build check trusts the file, and the run check does not
trust which artifact got deployed. An unresolved environment fails closed.

**`disposition: 'accountable'`** is that production disposition. It sits opposite
`adversarial` on the intent axis rather than the care axis: what it changes stays
changed, every call is recorded against its name, and it stops to ask rather than
acting and reporting afterwards. Alongside it, **agents now appear in a persona's
computed catalogue**, gated by the same scopes as the RPCs — an agent is reached
rather than declared, so a persona finds the specialists its roles unlock and
chooses between calling the API itself and handing the work over. That also fixes
a latent gap: `talkTo` was wired at the target but never advertised in the
instructions, so it was never used.

**`pikku persona sync <environment>`** provisions them: it creates each account
and applies the roles it declares, additively, and never revokes. Seeding is test
data and `db seed` does not run in production; a teammate doing a real job still
needs an account and its grants. It needs both halves of an environment — its API
to sign the person in, its database to write the grants — and `--dry-run` reports
who would be provisioned, with what, and why anyone was skipped.

In the console, a virtual user now says where it may act — the environments it
named, or the rule when it named none — and its dossier carries the `sync`
command alongside the `run` one, because the account is not a by-product of a
run. `accountable` reads as a disposition like the rest.
