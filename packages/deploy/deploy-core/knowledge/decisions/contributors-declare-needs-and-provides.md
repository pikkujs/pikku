---
type: decision
title: Contributors declare needs and provides; addons ship them in package.json
description: Platform service contributors are ordered by what they read and set, fail loudly on gaps, and an addon declares its own under pikku.contributors rather than through wireAddon
tags: [deploy, contributors, addons]
---

# Contributors declare needs and provides; addons ship them in package.json

`PlatformServiceContributor` carries `needs` and `provides`, and
`orderContributors` in `packages/deploy/deploy-core/src/platform-service-contributor.ts`
sorts by them before `collectContributorImports` / `collectContributorLines`
emit anything. A contributor runs after every contributor providing one of its
needs; ties keep input order, so a list that declares nothing comes out exactly
as before. A dotted need (`logSources.stage`) is met by a provider of the key or
of a prefix (`logSources`). Needs the entry already holds are named by the
adapter as `ContributorPlatform.runtimeServices` and reach emitted code as
`runtime.<name>`, the second argument of `createPlatformServices(env, runtime)`.

The sort refuses, with a `ContributorDependencyError` naming the contributors,
a need nothing meets, a key two contributors both provide, and a cycle
(including a contributor needing what it provides itself).

**Why:** contributors now come from several places at once — `dev.contributors`,
`deploy.contributors`, every wired addon — so list order is no longer something
one author controls. A host's log sources (`logSources.workspace`) and a cloud
addon's stage sources (`logSources.stage`, which needs `cloudSession` and the
`logSources` object) only compose when the order is derived from what each reads.

**What this rules out:**

- Silent override. Two contributors setting the same key is an error, not
  last-one-wins. `dedupeContributors` still collapses the same `name`, which is
  how a caller deliberately replaces a contributor.
- Declaring contributors on `wireAddon`. A contributor emits code into the
  host's entry, so it belongs to the package, not to one wiring of it: an addon
  lists them in its `package.json` under `pikku.contributors`
  (`[{ module, export? }]`, resolved from the addon's directory), next to
  `pikku.uses`. Remote addons contribute nothing — their code runs elsewhere.
- Building platform services before the database. The standalone entry calls
  `createPlatformServices` after the database is opened and after a CLI
  command (`migrate`, …) has had its chance to exit, so a contributor can need
  `kysely`.
