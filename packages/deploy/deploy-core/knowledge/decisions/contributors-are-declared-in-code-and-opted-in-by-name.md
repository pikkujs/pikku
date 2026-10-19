---
type: decision
title: Contributors are declared in code with defineContributors and opted in by name with wireAddon
description: A platform-service contributor is a plain object an addon registers in code; a project takes only the ones it lists in wireAddon, and one resolver orders, checks and writes them for dev and every deploy
tags: [deploy, contributors, addons]
---

# Contributors are declared in code with defineContributors and opted in by name with wireAddon

This supersedes the earlier design, in which a `PlatformServiceContributor`
emitted lines of TypeScript, and was listed in `dev.contributors`,
`deploy.contributors` or an addon's `package.json` under `pikku.contributors`.

An addon calls `defineContributors({ name: { dev?, deploy? } })`
(`@pikku/core/contributors`); each variant is a plain `Contributor` object with
`provides`, `needs`, `requires`, `when(platform)`, `run(services, env, runtime,
platform)`, `onServerStart` and `onServerStop`. A project opts in with
`wireAddon({ contributors: ['name'] })`. The inspector (both the TypeScript and
the Go one) records each variant's module and export; the CLI resolves them
with one function, `resolveTargetContributors`, for `pikku dev` and every
deploy, and writes a generated file that imports only the selected variants.
A provider describes its runtime through `ProviderAdapter.contributorSupport`
(`ContributorSupport`: `supported`, `runtimeServices`, the required
`runsServerLifecycle`, `widenPlatform`, `framework`).

**Why:**

- Real modules are typed and testable, where string-emitted lines were
  neither. The string templating was the thing the design set out to remove.
- Three registration paths (a config list for dev, one for deploy, an addon
  manifest) had appeared in a week. There is now one: code in the addon, opt-in
  in code in the project.
- Opt-in by name keeps an installed addon from injecting services into a project
  that did not ask for them (fail closed). The default is none.
- Build-time facts are one object, `ContributorPlatform`, built by one CLI
  function from the config, the `db/<dialect>` folders, the generated coercion
  map and the inspector's service aggregation, so dev and deploy agree.

**What this rules out:**

- Silent override. Two contributors providing one key after `when` and
  `requires` filtering is a build error naming both. There is no `replaces`, no
  tier and no priority. The target's baseline services (`runtimeServices`) are
  the one exemption: a contributor may replace them. A decorator declares empty
  `provides`; a contributor providing what it needs is a cycle.
- A config route. A config cannot carry source, so a host that injects an addon
  (CI, Studio) writes a gitignored wiring file with `wireAddon({ name, package,
contributors })`.
- Quietly building a different app. An opted-in contributor whose `requires` the
  target cannot supply is a build error; a contributor with no variant for the
  target is not part of it; a provider with no `contributorSupport` fails when a
  contributor with a deploy variant is opted in.
- Starting work a target would never run. `onServerStart` is a build error where
  `runsServerLifecycle` is false (a Worker); a missed `onServerStop` only warns,
  because a missed teardown is harmless. `runsServerLifecycle` is required so a
  new provider has to decide.
- Runtime SQL in a contributor. Schema comes from `pikku db generate`.
- Contributors for libraries. `@pikku/kysely` and pg-boss stay explicit in
  `createSingletonServices`; contributors are for services the target owns.

**Hook contract:** start hooks run before the app's `beforeStart` in `needs`
order and a failure aborts startup; stop hooks run after the app's `afterStop` in
reverse order and every one is attempted (`composeServerLifecycle` in
`@pikku/core/lifecycle`).

**Gotchas:** each `dev` and `deploy` variant must live in its own module, or
both are bundled; a contributor whose binding is missing at startup throws.
