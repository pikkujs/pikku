---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/addon-console': patch
'@pikku/playwright': patch
'@pikku/knowledge': patch
'@pikku/cucumber': patch
'@pikku/skills': patch
---

Add `definePersonas()`: the people a project's scenarios and virtual users run
as, declared in code.

There used to be three names for two-and-a-bit things — an *actor* in
`scenarios.actors`, a *persona* in `scenarios.personas`, and a *virtual user*
declared separately against an actor. In practice almost every actor was its own
kind, so the second set carried no information and the third was a third place
for a name to drift. There is now one declaration:

```ts
definePersonas({
  shopper: {
    name: 'Sam Shopper',
    jobTitle: 'Shopper',
    personality: 'Buys in a hurry and leaves tabs open',
    roles: ['customer'],
    disposition: 'careless',
    goals: ['Buy something without reading anything'],
    account: {},
  },
})
```

A persona is a person: what they are like, what they want, the roles they hold,
and **one** account they sign in with — `account: {}` plus `linkedAccounts` for
the rare case of more, modelled on how better-auth does linking. A persona with a
`disposition` is a virtual user; `runnable: false` marks someone who only ever
exists to be acted upon — banned, shared with, reset — and is never handed a
session.

**A persona names roles, never scopes.** Scopes come from `defineSystemRole()`
expansion, so the build fails if a persona names a role nobody declared, and
fails again if a role confers a scope no `defineScope` declares. Running one only
ever has to check that its roles are still valid.

**Addresses are computed, never declared.** `personaEmail(id, domain, runId)`
derives `<id>[+runId]@<domain>` from `scenarios.emailDomain`, so a seed, a
scenario run and a virtual-user run cannot disagree about who they are signing in
as. `scenarios.actors` and `scenarios.personas` are gone from
`pikku.config.json` — only `emailDomain` remains.

`actor` survives in exactly one place: the name of a **slot in a scenario step**,
which is the role a persona is cast in for that step. `pikkuVirtualUser()`,
`kind`, `grants` and the `actor` field are removed; the `actors` service is now
`personas`, and the CLI's `virtual-user` commands are now `pikku persona list` /
`pikku persona run`. `budget` and `allowApprovalRequired` moved to run flags —
how much you will spend today is not a fact about a person.

`@pikku/cucumber` drops its `Actor` class and `ActorDispatchContext`: a
hand-rolled cookie jar that a persona's own typed session replaces outright.
