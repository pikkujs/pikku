# Contributors

A **contributor** is a small module that builds one or more services a target owns, for example a database client from a binding, a queue, or a mail client, and hands them to your `createSingletonServices`. Contributors are declared in code with `defineContributors` and a project opts in to them by name with `wireAddon`. Nothing is injected into a project that did not ask for it.

Contributors are for **target-owned services**: services whose construction depends on where the app runs (`pikku dev`, a standalone bundle, a Cloudflare unit). Services every target builds the same way (`@pikku/kysely`, pg-boss) stay explicit in your own `createSingletonServices`.

## Declare contributors (addon authors)

Contributors are registered by an addon, with one `defineContributors` call. The argument is an object literal keyed by contributor name. Each value holds an optional `dev` variant and an optional `deploy` variant, and each variant is a plain `Contributor` object.

```ts
// src/contributors.ts
import { defineContributors } from '@pikku/core/contributors'
import { queueDev } from './queue-dev.js'
import { queueDeploy } from './queue-deploy.js'
import { auditDeploy } from './audit-deploy.js'

export const contributors = defineContributors({
  queue: { dev: queueDev, deploy: queueDeploy },
  audit: { deploy: auditDeploy },
})
```

```ts
// src/queue-deploy.ts
import type { Contributor } from '@pikku/core/contributors'

export const queueDeploy: Contributor = {
  provides: ['queueService'],
  needs: ['logger'],
  requires: ['cloudflare'],
  when: (platform) => platform.needsQueue,
  run(services, env, runtime, platform) {
    if (!env.JOBS) throw new Error('queue: the JOBS binding is missing')
    services.queueService = makeQueue(env.JOBS, runtime.logger)
  },
  async onServerStart(services) {
    // runtime setup, where the server lifecycle runs
  },
  async onServerStop(services) {
    // teardown
  },
}
```

`defineContributors` is read statically by the inspector. It must be called with an object literal, and every `dev` / `deploy` value must be a reference to an `export const` (not an inline object or a call), because the build imports just that variant. A name defined twice is an error (PKU361), as is anything the inspector cannot read statically (PKU360). Run `pikku all` in the addon: it writes `.pikku/contributors/pikku-contributors-meta.gen.json`, which a host reads to opt in. Ship `.pikku` in the package's `files`, as for any addon metadata.

**Put each `dev` and `deploy` variant in its own module.** The build imports the module that exports the selected variant. If `queueDev` and `queueDeploy` share a file, both are bundled into every target, including production bundles. Shared helpers go in a third module that both import.

### The `Contributor` fields

| Field                                   | Meaning                                                                                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provides?: string[]`                   | Service keys `run` sets on `services`. May be empty for a contributor that only decorates a service another one provides.                                                                                                                                        |
| `needs?: string[]`                      | Service keys this contributor reads, from `runtime` (services the target already holds) or from `services` set by another contributor. A dotted key (`logSources.stage`) is met by a contributor providing the key exactly or providing a prefix (`logSources`). |
| `requires?: ContributorBindingSource[]` | Binding sources the target must supply: `'env'` (the default) or `'cloudflare'`.                                                                                                                                                                                 |
| `when?(platform): boolean`              | Build time only. Returning `false` leaves the contributor out of that build entirely. Runtime `if (env.X)` guards belong inside `run`, because `when` never runs on the deployed unit.                                                                           |
| `run(services, env, runtime, platform)` | Constructs services and sets them on `services`. `services` is one shared bag for every contributor of the unit, so a lazy reader sees services set by contributors that run later. `runtime` holds the target's baseline services. `platform` is plain data.    |
| `onServerStart?(services)`              | Runtime setup (for example pg-boss `start()`), called where the server lifecycle runs. `services` is the unit's services.                                                                                                                                        |
| `onServerStop?(services)`               | Teardown, called where the server lifecycle runs.                                                                                                                                                                                                                |

`run` only constructs. Do not run SQL from it: schema comes from `pikku db generate`.

### `ContributorPlatform`

`when` and `run` receive the same build-time facts, as one plain object (inlined once into the generated file, so `run` gets it as data):

| Field                                       | Meaning                                                                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceNames`                              | The services the app (dev) or the unit (deploy) requires.                                                                                                                                                                                     |
| `needsQueue`, `needsWorkflow`, `needsAgent` | Whether those capabilities are required.                                                                                                                                                                                                      |
| `runtimeServices?`                          | The baseline services the target already holds before any contributor runs. They meet a `needs` and are read as `runtime.<name>`.                                                                                                             |
| `db?`                                       | `{ engine: 'sqlite' \| 'postgres', coercionMap? }`, when the project declares a database (`createConfig` or a `db/<dialect>` folder) and the engine is sqlite or postgres. `coercionMap` is the column coercion map from `pikku db generate`. |

A deploy also widens the platform with `unit` (`name`, `role`, `target`, `dependsOn`, `dispatch`), typed as `DeployContributorPlatform` in `@pikku/deploy`. Declare `Contributor<Services, DeployContributorPlatform>` to read it; a contributor that also has a `dev` variant must not, since `pikku dev` has no unit.

### Ordering, clashes and cycles

The build selects contributors in this order: opted in, has a variant for the target, `when` true, `requires` met. It then orders and checks what is left.

- **Ordering.** Every contributor runs after the contributors that provide one of its `needs`. Contributors with no relation keep the order of the `wireAddon` lists.
- **Clash rule.** Two contributors providing the same key, after `when` and `requires` filtering, is a build error naming both. An exclusive pair of `when`s therefore never clashes, and only the winner is bundled. Baseline services the target already holds (`runtimeServices`, for example the standalone entry's queue and scheduler) are exempt: a contributor may provide the same key to replace one.
- **Decorators.** A contributor that wraps a service another one provides declares `provides: []` and `needs: ['thatService']`, and reads and replaces `services.thatService` in `run`.
- **Self-cycle.** A contributor that provides what it needs (`provides: ['x'], needs: ['x']`, even for a baseline `x`) depends on itself and is a cycle error. Use a decorator instead.
- **Unmet needs and cycles** are build errors that name the contributors.

### `requires`

`requires` defaults to `['env']`. The target says which sources it supplies: `pikku dev`, the standalone entry, the generic server entry and a Cloudflare container supply `env`; a Cloudflare Worker supplies `env` and `cloudflare`.

- A contributor the project **opted in to** whose `requires` the target cannot supply is a build error naming it. The app was written to use it, so building without it would ship a different app. To mean "not on this target", return `false` from `when`, or ship no variant for it.
- A contributor with **no variant for the target** (no `dev` under `pikku dev`, no `deploy` in a deploy) is silently not part of that target.

### Failing closed

A contributor whose bindings are missing at startup must throw from `run`. A missing binding would fail on first use anyway, and a loud startup failure names the cause. Do not fall back to a stub.

## Opt in (project authors)

A project takes contributors from an addon it wires, by name. The list is an array of string literals; the default is none.

```ts
wireAddon({
  name: 'jobs',
  package: '@my-org/addon-jobs',
  contributors: ['queue', 'audit'],
})
```

A name the addon does not register is a build error (PKU363) that lists the names it does register. A list the inspector cannot read statically is PKU362.

The services contributors build reach your app as the second argument of `createSingletonServices(config, existingServices)`, so read them from `existingServices` and put them on the object you return.

### Hosts that inject an addon

A host that adds an addon on the project's behalf (CI, Pikku Studio) does the same thing. It writes a host-owned, gitignored wiring file in the project's source tree containing `wireAddon({ name, package, contributors })`. There is no config-file route for contributors: a config cannot carry source.

## What runs where

| Target                                                | `dev` variant | `deploy` variant | `onServerStart` / `onServerStop`                                                                                         |
| ----------------------------------------------------- | :-----------: | :--------------: | ------------------------------------------------------------------------------------------------------------------------ |
| `pikku dev`                                           |      yes      |        -         | run                                                                                                                      |
| `pikku serve`                                         |      yes      |        -         | run                                                                                                                      |
| Generic server entry (provider-agnostic)              |       -       |       yes        | run                                                                                                                      |
| Standalone (`@pikku/deploy-standalone`)               |       -       |       yes        | run                                                                                                                      |
| Cloudflare container (`target: 'server'`)             |       -       |       yes        | run                                                                                                                      |
| Cloudflare Worker                                     |       -       |       yes        | `onServerStart` is a build error; `onServerStop` is a warning                                                            |
| Other providers (`deploy-serverless`, `deploy-azure`) |       -       |        no        | A provider without `contributorSupport` fails the build when the project opted in to a contributor with a deploy variant |

`pikku dev` and `pikku serve` load `.pikku/contributors/pikku-dev-contributors.gen.ts`, written by `pikku all`, and spread what it builds over the local services before `createSingletonServices` runs, so a contributed service beats the local one. Both skip the file when `NODE_ENV=production`. Under `pikku dev` the project's pikku config must have a `db` whenever the project declares a database and has contributors opted in; otherwise `pikku all` fails, because contributors would see `platform.db` with no `kysely` to decorate.

A Worker (or any handler that is not a long-running server) never runs the server lifecycle. A selected contributor with `onServerStart` there would silently never start, so it is a build error naming the contributor and the unit. A missed `onServerStop` is harmless, so it only warns.

### The hook contract

- Start hooks run **before** the app's `beforeStart`, in `needs` order. The app's `afterStart` and `beforeStop` are unchanged.
- Stop hooks run **after** the app's `afterStop`, in reverse `needs` order. The app's `afterStop` therefore sees services that contributor hooks have not yet torn down.
- A start hook that throws aborts startup with an error naming the contributor (`Contributor 'x' failed in onServerStart: ...`).
- Every stop hook is attempted, even when an earlier one or the app's `afterStop` threw. The failures are then thrown together, each named.

The app's own hooks come from `pikkuServerLifecycle`. The Cloudflare container entry runs them as well as the contributors' (it did not before).

## Providers (adapter authors)

A deploy provider tells contributor resolution what a unit's runtime can do through `ProviderAdapter.contributorSupport(ctx)`, which returns a `ContributorSupport`:

```ts
interface ContributorSupport {
  supported: readonly ContributorBindingSource[] // sources the runtime supplies
  runtimeServices: readonly string[] // baseline services the entry holds first
  runsServerLifecycle: boolean // REQUIRED: does the entry call onServerStart/onServerStop?
  widenPlatform?(platform: ContributorPlatform): ContributorPlatform
  framework?: readonly FrameworkContributor[] // contributors the provider selects itself
}
```

- A provider **without** `contributorSupport` supports no contributors. The build fails if the project opted in to any with a deploy variant.
- `runsServerLifecycle` is required, so a new provider has to decide. `false` makes `onServerStart` a build error and `onServerStop` a warning.
- `framework` lists contributors the provider adds beside the opted-in ones (the Cloudflare adapter's `kysely-coercion`). They are marked `optional` when they should be dropped rather than fail the build because nothing meets a `needs`.
- The build writes `platform-services.gen.ts` beside each unit's entry and sets `ctx.platformServices`. The entry imports `createPlatformServices(env, runtime)` and calls it, then passes the result to `createSingletonServices`. `@pikku/deploy` exports `entryLifecycleVariable` and `composedLifecycleLines` so an entry wires the composed lifecycle the same way every other entry does. The file is removed when no contributor is selected.

## Column coercion on Cloudflare

The Cloudflare adapter selects the optional contributor `kysely-coercion` itself. It decorates `services.kysely` (it provides nothing, and needs `kysely`) and applies only when some contributor provides `kysely` and the app has a coercion map. Pass `coercion: false` to the adapter when your platform's own `kysely` contributor already applies the map. See [`db-column-annotations.md`](./db-column-annotations.md).

## Errors at a glance

| You wrote                                                                 | The build says                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `defineContributors` with a non-literal argument or an inline variant     | PKU360                                                                   |
| The same contributor name twice                                           | PKU361                                                                   |
| `wireAddon({ contributors })` with a non-literal list                     | PKU362                                                                   |
| An opt-in name the addon does not register                                | PKU363                                                                   |
| `pikku.contributors` still in an addon's `package.json`                   | PKU364 (a hard error, no longer silently ignored)                        |
| `dev.contributors` or `deploy.contributors` still in `pikku.config.json`  | the CLI refuses to load the config, naming the key                       |
| Two contributors providing one key (after `when` and `requires`)          | `Contributors 'a' and 'b' both provide 'key'`                            |
| A `needs` nothing provides                                                | `Contributor 'a' needs 'key', which nothing provides`                    |
| `provides` and `needs` forming a loop, including a self-loop              | `Contributors depend on each other in a cycle`                           |
| An opted-in `requires` the target cannot supply                           | `... cannot supply what a contributor the project opted in to ... needs` |
| `onServerStart` on a Worker unit                                          | `... does not run the server lifecycle`                                  |
| Opted in with a deploy variant on a provider without `contributorSupport` | `... cannot run the contributors the project opted in to`                |
