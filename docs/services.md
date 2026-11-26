# Services

A **service** is a factory that builds one or more of the services your functions use, for example a database client from a binding, a queue, or a mail client, and hands them to your `createSingletonServices`. Services are declared in code with `pikkuService`. A project opts in to an addon's services by name with `wireAddon`; nothing is injected into a project that did not ask for it.

`pikkuService` is for **target-owned services**: services whose construction depends on where the app runs (`pikku dev`, a standalone bundle, a Cloudflare unit). Services every target builds the same way (`@pikku/kysely`, pg-boss) can stay explicit in your own `createSingletonServices`.

## Declare a service

```ts
// src/services/mailer.ts
import { pikkuService } from '#pikku/service'

export const mailer = pikkuService(async ({ logger }, env) => {
  if (!env.SMTP_URL) throw new Error('mailer: SMTP_URL is missing')
  return { mailer: makeMailer(env.SMTP_URL, logger) }
})
```

A factory takes `(services, env)`:

- **What it needs** are the keys it destructures from `services`. There is no `needs` list.
- **What it provides** are the keys of the object it returns. There is no `provides` list.
- `env` is the runtime environment. Guards on it belong in the factory, since the factory is what runs on the deployed unit.

The inspector reads needs and provides from the source, so a factory must be written inline, destructure its first parameter by plain name (no rest element, no `(services) => ...`), and return an object type with known keys. Anything else is a build error naming the service.

The same function applies on every target. For a different build per target, pass an object:

```ts
export const queue = pikkuService({
  dev: ({ logger }) => ({ queueService: new InMemoryQueueService(logger) }),
  deploy: async ({ logger }, env) => ({
    queueService: await connectQueue(env.QUEUE_URL, logger),
  }),
  async onServerStart(services) {
    // runtime setup, where the server lifecycle runs
  },
})
```

`dev`, `deploy` and `common` are the variants. A target's own variant overrides `common`. A target a service has no variant for leaves it out, so a service that needs its keys on that target fails there.

`dev`, `deploy` and `common` may each be a reference to an exported const instead of an inline function:

```ts
export const queue = pikkuService({ dev: queueDev, deploy: queueDeploy })
```

**Put each variant given by reference in its own module.** The build imports only the module that exports the selected variant. If `queueDev` and `queueDeploy` share a file, both reach every bundle, production included (PKU375).

### Typed services: `#pikku/service`

`pikku all` generates `#pikku/service`. It holds `SingletonServices`: the type you declared plus every key a service provides, as required properties with no `any`. `pikkuService` imported from it is typed against that, so a destructured need is the real type. `SingletonServices` from `#pikku/function` is this merged type, so a function sees what a service provides without a cast.

An addon has no services type of its own and authors against `@pikku/core/pikku-service`, where `services` is untyped.

### Teardown and the server lifecycle

- `onServerStart(services)` runs where the server lifecycle runs, after every service is built and before the app's `beforeStart`, in dependency order. A start hook that throws aborts startup with `Service 'x' failed in onServerStart: ...`.
- Teardown is the service's own `stop()` on the value it provides. `stopSingletonServices` calls it in reverse of the order services were built, addon packages first. To make one service tear down before another, build the other first by having it need the first.

`pikkuService` only constructs. Do not run SQL from a factory: schema comes from `pikku db generate`.

### Failing closed

A service whose bindings are missing at startup must throw from its factory. A missing binding would fail on first use anyway, and a loud startup failure names the cause. Do not fall back to a stub.

## Ordering, clashes and cycles

The build reads the services your project declares and the ones it opted in to, selects the ones the target reaches, picks each one's variant for the target, then orders and checks what is left.

- **Reachability.** A target runs only the services it reaches. The seed is what the target's functions, middleware, permissions and other wirings destructure: the whole app for `pikku dev` and `pikku serve`, the unit's own functions for a deploy unit. A service is selected when at least one key it provides is reached, and what a selected service destructures is reached too, transitively. The names your `pikkuServices` factory destructures from `existingServices` seed it too, so a service you read there is never dropped. A service nothing reaches is not part of that target: no variant check, no `onServerStart` error, no import in the runner.

- **Ordering.** Every service runs after the services that provide one of its needs.
- **Baseline.** Each target holds some keys before any service runs: what `pikku dev` injects, or what a deploy provider's entry builds. They meet a need, and exactly one service may provide a baseline key, replacing it.
- **Clash rule.** Two services providing the same key is a build error naming both, on every target, reached or not: the type has one owner per key. Every other check (variants, needs, cycles, `onServerStart`) runs on the selected services only.
- **Self-cycle.** A service that provides a key it needs depends on itself. That is an error: its own factory cannot read what it is about to provide.
- **Unmet needs and cycles** are build errors that name the services.
- **No variant.** A selected service with no variant for a target is an error, unless every key it provides is already in that target's baseline, in which case the target simply does not run it.

## Opt in to an addon's services

A project takes services from an addon it wires, by name. The list is an array of string literals; the default is none.

```ts
wireAddon({
  name: 'jobs',
  package: '@my-org/addon-jobs',
  services: ['queue', 'audit'],
})
```

The names are typed. `pikku all` reads the services meta each wired addon published (`.pikku/services/pikku-services-meta.gen.json`) and writes the union of its names into `#pikku/addon`, so an editor completes the valid names and `tsc` rejects one the addon does not declare. A name the addon does not declare is also a build error (PKU374) that lists the names it does. An addon whose meta is not installed (a remote addon, or one that has not run `pikku all` yet) types its names as plain `string`. A list the inspector cannot read statically is PKU373.

A remote addon takes them from the installed package that supplies its screens: `wireRemoteAddon({ ..., local: { package, services: ['queue'] } })`.

The services reach your app as the second argument of `createSingletonServices(config, existingServices)`, so read them from `existingServices` and put them on the object you return.

An addon publishes its services by exporting `pikkuService` consts and running `pikku all`, which writes the meta. Ship `.pikku` in the package's `files` and export `./.pikku/services/*`, as for any addon metadata.

### Hosts that inject an addon

A host that adds an addon on the project's behalf (CI, Pikku Studio) writes a host-owned, gitignored wiring file in the project's source tree containing `wireAddon({ name, package, services })`. There is no config-file route for services: a config cannot carry source.

## What runs where

| Target                                                | `dev` variant | `deploy` variant | `onServerStart`                                                                           |
| ----------------------------------------------------- | :-----------: | :--------------: | ----------------------------------------------------------------------------------------- |
| `pikku dev`                                           |      yes      |        -         | runs                                                                                      |
| `pikku serve`                                         |      yes      |        -         | runs                                                                                      |
| Generic server entry (provider-agnostic)              |       -       |       yes        | runs                                                                                      |
| Standalone (`@pikku/deploy-standalone`)               |       -       |       yes        | runs                                                                                      |
| Cloudflare container (`target: 'server'`)             |       -       |       yes        | runs                                                                                      |
| Cloudflare Worker                                     |       -       |       yes        | build error                                                                               |
| Other providers (`deploy-serverless`, `deploy-azure`) |       -       |        no        | a provider without `serviceSupport` fails the build when the project declares a service  |

`pikku dev` and `pikku serve` load `.pikku/services/pikku-dev-services.gen.ts`, written by `pikku all`, and spread what it builds over the local services before `createSingletonServices` runs, so a provided service beats the local one. Both skip it when `NODE_ENV=production`. A service may need only a key the dev baseline holds (no `variables`, `schema` or `secrets`) or a key another service provides. A service with only a `deploy` variant is an error on dev unless it provides only keys the dev baseline already holds.

A Worker (or any handler that is not a long-running server) never runs the server lifecycle. A selected service with `onServerStart` there would silently never start, so it is a build error naming the service and the unit.

### The hook contract

- Start hooks run **before** the app's `beforeStart`, in dependency order. The app's `afterStart` and `beforeStop` are unchanged.
- A start hook that throws aborts startup with an error naming the service.

The app's own hooks come from `pikkuServerLifecycle`.

## Providers (adapter authors)

A deploy provider tells service resolution what a unit's runtime holds through `ProviderAdapter.serviceSupport(ctx)`:

```ts
interface ServiceSupport {
  baseline: readonly string[] // keys the entry holds before any service runs
  runsServerLifecycle: boolean // REQUIRED: does the entry call onServerStart?
}
```

- A provider **without** `serviceSupport` runs no services. The build fails if the project declares or opts in to one that runs on deploy.
- `baseline` is handed to the generated runner as `runtime`. The runner builds every service on a copy of it and returns the whole bag, so a service may replace a baseline key.
- `runsServerLifecycle` is required, so a new provider has to decide. `false` makes `onServerStart` a build error.
- The build writes `platform-services.gen.ts` beside each unit's entry and sets `ctx.platformServices`. The entry imports `createPlatformServices(env, runtime)`, calls it, and passes the result to `createSingletonServices`. `@pikku/deploy` exports `entryLifecycleVariable` and `composedLifecycleLines` so an entry wires the composed lifecycle the same way every other entry does. The file is removed when no service is selected.

## Host platform services

A host (a hosting platform, a local tool) can supply platform services from one ordinary module:

```ts
export const createPlatformServices = async (
  env,
  services, // what the entry holds so far
  { requiredServices } // the services this unit, or pikku dev, reaches
) => ({
  queueService: new HostQueueService(env),
})
```

- It runs last, and what it returns replaces what the entry holds. Return only what you provide.
- The app receives the result as `existingServices`. If the app returns its own service for one of those keys, the app's wins and `pikkuServices` logs a warning.
- A `kysely` it creates gets the same column coercion as `pikku dev`.
- Teardown is each service's `stop()`.
- It is host code and reads the whole `env`. An addon's services never do.

**Choosing the module:**

- Deploy: the deploy provider implements `platformServicesModule(ctx)`.
- `pikku dev` and `pikku serve`: set `devPlatformServices` in `pikku.config.json` to a package specifier, or a path starting with `.`. Not loaded under `NODE_ENV=production`.

On Cloudflare Workers, Cloudflare containers and the server entry, `createConfig` receives the `variables` the module returns. In `pikku dev`, `pikku serve` and standalone, the database is set up from the config before the module runs, so `createConfig` does not see them.

## Column coercion

When the app has a coercion map (from `pikku db generate`) and a service provides `kysely`, the generated runner wraps that service so the `kysely` it returns carries `createCoercionPlugin` from `@pikku/kysely`, before any service that needs `kysely` runs. A deployed query then returns the same Date, boolean and parsed JSON values it does under `pikku dev`. No provider selects anything for this, and a baseline `kysely` is the entry's own and is not wrapped. See [`db-column-annotations.md`](./db-column-annotations.md).

## Errors at a glance

| You wrote                                                              | The build says                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A `pikkuService` the inspector cannot read                             | PKU369                                                               |
| A destructure with a rest element, a computed key or no destructure    | PKU371                                                               |
| A return type that is not an object with known keys                    | PKU372                                                               |
| `wireAddon({ services })` with a non-literal list                      | PKU373                                                               |
| An opt-in name the addon does not declare                              | PKU374                                                               |
| `dev` and `deploy` variants exported from one module                   | PKU375                                                               |
| The same exported service name twice                                   | PKU376                                                               |
| Any `wire*` call inside a function                                     | PKU367                                                               |
| `dev.contributors` or `deploy.contributors` in `pikku.config.json`      | the CLI refuses to load the config, naming the key                   |
| Two services providing one key                                         | a build error naming both                                            |
| A need nothing provides                                                | a build error naming the service and the baseline                    |
| `provides` and `needs` forming a loop, including a self-loop           | a build error naming the services                                    |
| `onServerStart` on a Worker unit                                       | `... does not run the server lifecycle`                              |
| A service on a provider without `serviceSupport`                       | `... cannot run the services the project declares ...`               |
