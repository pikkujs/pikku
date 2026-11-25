# Providers

A **provider** is a factory that builds one or more of the services your functions use, for example a database client from a binding, a queue, or a mail client. Providers are declared in code with `defineProvider` (once per process) or `defineWireProvider` (once per invocation), and a project opts in to an addon's providers by name with `wireAddon`. Nothing is injected into a project that did not ask for it.

Use a provider for services whose construction depends on where the app runs (`pikku dev`, a standalone bundle, a Cloudflare unit). Services every target builds the same way can stay explicit in your own `createSingletonServices`.

**Providers are in-process, trusted code.** A provider from an addon runs inside your process with the services it needs. The lock, the scoped environment and the protected keys below are drift detection and least privilege against an honest addon that changes, not a sandbox against a hostile one. Read what you opt in to. Because providers run in your process, `wireRemoteAddon` cannot contribute them: a `providers` option there is a build error (PKU381), and an in-process package named in `local` contributes instead.

## Declare a provider

```ts
// src/services/mailer.ts
import { defineProvider } from '#pikku/provider'

export const mailer = defineProvider(async ({ logger }, env) => {
  if (!env.SMTP_URL) throw new Error('mailer: SMTP_URL is missing')
  return { mailer: makeMailer(env.SMTP_URL, logger) }
})
```

A factory takes `(services, env)`:

- **What it needs** are the keys it destructures from `services`. There is no `needs` list.
- **What it provides** are the keys of the object it returns. There is no `provides` list.
- `env` is the runtime environment. Guards on it belong in the factory, since the factory is what runs on the deployed unit.

The inspector reads needs and provides from the source, so a factory must be written inline, destructure its first parameter by plain name (no rest element, no computed key), and return an object type with known keys. A factory that needs nothing omits the parameter or names it `_services` and never reads it. Passing the whole `services` object on (`(services) => connect(services)`) is PKU371, and a return type the inspector cannot read is PKU372. A provider that provides no key and adds to no collection could never be selected (PKU380).

`defineProvider` only constructs. Do not run SQL from a factory: schema comes from `pikku db generate`.

### Variants and profiles

The same function applies on every target. For a different build per target, pass an object:

```ts
export const queue = defineProvider({
  dev: ({ logger }) => ({ queueService: new InMemoryQueueService(logger) }),
  'deploy:standalone': async ({ logger }, env) => ({
    queueService: await connectQueue(env.QUEUE_URL, logger),
  }),
  'deploy:cloudflare-worker': (_services, env) => ({
    queueService: new CloudflareQueueService(env.QUEUE),
  }),
  async onServerStart(services) {
    // runtime setup, where the server lifecycle runs
  },
})
```

The variants are `dev`, `deploy`, `common` and `deploy:<profile>`, where the profile is the unit's runtime: `standalone`, `cloudflare-worker`, `cloudflare-container` or `server`. A target picks the first match of its profile variant, `deploy`, then `common` (`pikku dev` picks `dev`, then `common`). Any other key, including `deploy:fly`, is a build error that lists the valid ones (PKU369, PKU377).

On a `deploy:cloudflare-worker` variant `env` is typed as the Worker's bindings, so `env.DB` is `unknown` there and `string | undefined` elsewhere.

A target a provider has no variant for leaves it out. If something reached on that target needs one of its keys, the build fails with PKU388, naming what was looked for. A provider with no variant on a target that already holds every key it provides in its baseline is simply not run there.

Each variant may be a reference to an exported const instead of an inline function:

```ts
export const queue = defineProvider({
  dev: queueDev,
  'deploy:standalone': queueDeploy,
})
```

**Put each variant given by reference in its own module.** The build imports only the module that exports the selected variant. If `queueDev` and `queueDeploy` share a file, both reach every bundle (PKU375). A provider with `onServerStart` is imported whole, so all its variants reach the bundle.

### Optional needs

List a key in `optional` when the factory works without it:

```ts
export const events = defineProvider({
  optional: ['queueService'],
  common: ({ queueService }) => ({ events: makeEvents(queueService) }),
})
```

The factory parameter is typed `T | undefined` for that key. An optional need is met when something provides the key and left `undefined` when nothing does; when something does, the providing provider is selected and runs first. `optional` must be an array of string literals naming keys the factory destructures (PKU378). A need that is not optional and that nothing provides is PKU386, with a hint to list it. A need cannot be given an `= undefined` default as a way to make it optional.

A provider may return a key conditionally (`auditLog?:`, or `...(x ? { k } : {})`). That key is optional in the merged `SingletonServices` type, and a provider that needs it must list it in `optional` (PKU391 otherwise).

### Protected keys and `replaces`

`secrets`, `variables`, `credentialService`, `auth`, `jwt` and `logger` are protected. A provider may provide one only by saying so in the source:

```ts
export const pinoLogger = defineProvider({
  replaces: ['logger'],
  common: ({ config }) => ({ logger: makePino(config) }),
})
```

Without `replaces`, providing a protected key is PKU394, on every target and whichever variant provides it. `replaces` must name keys some variant provides (PKU382). An addon's `replaces` is part of its lock entry.

### Typed services: `#pikku/provider`

`pikku all` generates `#pikku/provider`. It holds `SingletonServices` (the type you declared plus every key a provider provides, as required properties with no `any`, keys returned conditionally as optional) and `WireServices`. `defineProvider` and `defineWireProvider` imported from it are typed against those, so a destructured need is the real type. `SingletonServices` from `#pikku/function` is the merged type, so a function sees what a provider provides without a cast.

An addon has no services type of its own and authors against `@pikku/core/provider`, where `services` is untyped.

A function that destructures a key nothing provides fails the build for each unit that includes it (PKU390), naming the function and where. Keys the project's own `createSingletonServices` returns count as provided, and so do keys optional in the declared type. If `createSingletonServices` returns a cast type (`as RequiredSingletonServices`), every key looks provided and the check cannot fire.

## Providers per request

`defineWireProvider` builds a service once per invocation. Its factory takes the singleton services and the invocation's `wire`:

```ts
export const requestScope = defineWireProvider(({ logger }, wire) => ({
  requestScope: { logger, session: wire.session },
}))
```

It is opted in through the same `providers: [...]` list, and it has the same variants, `optional` and `replaces`.

- A wire provider may need singleton keys and earlier wire keys. A singleton provider that needs a wire key is PKU392.
- A wire key a singleton already holds is PKU393: a key has one lifetime. A project `createWireServices` that returns a key a wire provider provides is PKU393 too.
- A wire provider cannot provide `auditLog`, `analytics`, `session` or `rpc`, which core builds for every invocation (PKU399), and it cannot add to a collection (PKU383) or have `onServerStart` (PKU369).
- Core builds `auditLog` before the wire providers run, only for a function with an audit config and a singleton `audit`. A wire provider that reads it lists it in `optional`.
- A request builds only the wire providers its function reaches. A `singletonServicesOnly` function builds none. Addon functions never see the host's wire providers.
- A wire provider that throws fails the invocation and stops the wire providers already built.

## Collections

A collection is a list providers add one item to. A package declares it and a provider adds to it with `addTo`:

```ts
export const aiProviders = defineProviderCollection<'aiProviders', AiProvider>(
  'aiProviders'
)

export const openai = defineProvider({
  addTo: aiProviders,
  common: () => ({ name: 'openai', client: makeOpenAI() }),
})
```

A reader destructures the collection's name (`aiProviders`) and gets a frozen list of `{ label, item }` entries sorted by label, where the label is the provider's name. With no contributor the list is empty. A contributor with no variant for a target is absent there (no error), and a collection no selected provider reads pulls in none of its contributors, so an SDK nobody reaches is not bundled. The collection's name is a services key: a provider cannot also provide it (PKU398), two declarations of one name are PKU379, and a reader that is itself a contributor is a cycle (PKU387).

An item may have a `stop()`. It is called in reverse resolved order with the services.

Core owns one collection, `analyticsSinks`, of `{ sink, map }` items. An addon or the project adds a sink with `defineProvider({ addTo: analyticsSinks, ... })`, and `fanOutAnalytics` reads the entries. See [`telemetry-sinks.md`](./telemetry-sinks.md).

## Ordering, clashes and cycles

The build reads the providers your project declares and the ones it opted in to, selects the ones the target reaches, picks each one's variant for the target, then orders and checks what is left.

- **Reachability.** A target runs only the providers it reaches. The seed is what the target's functions, middleware, permissions and other wirings destructure: the whole app for `pikku dev` and `pikku serve`, the unit's own functions for a deploy unit. A provider is selected when at least one key it provides is reached, and what a selected provider needs is reached too, transitively. The names your `createSingletonServices` destructures from `existingServices` seed it too. A provider nothing reaches is not part of that target: no variant check, no `onServerStart` error, no import in the runner.
- **Ordering.** Every provider runs after the providers that provide one of its needs.
- **Baseline.** Each target holds some keys before any provider runs: what `pikku dev` injects, or what a deploy provider's entry builds. They meet a need, and one provider may replace a baseline key.
- **Clash rule.** Two providers providing the same key is PKU385, naming both, on every target, reached or not: the type has one owner per key. Every other check runs on the selected providers only.
- **Self-cycle and cycles** are PKU387, naming the providers.
- **Entry-owned keys.** Some targets open a service themselves: a standalone build opens its own `kysely`, and `pikku dev` does when the project has a `db` section. No provider may replace such a key (PKU397). A database addon therefore has no `deploy:standalone` variant, and a project that wires one has no `db` section for `pikku dev`.
- **Runtime enforcement.** A factory sees a frozen view of exactly its declared needs. Reading another key throws `undeclared-read`; returning a key it did not declare throws `undeclared-return`; omitting a required one throws `missing-return`. Functions never see this view.

## Opt in to an addon's providers

A project takes providers from an addon it wires, by name. The list is an array of string literals; the default is none.

```ts
wireAddon({
  name: 'jobs',
  package: '@my-org/addon-jobs',
  providers: ['queue', 'audit'],
})
```

The names are typed. `pikku all` reads the providers meta each wired addon published (`.pikku/addon/providers/pikku-providers-meta.gen.json`, `{ metaVersion: 2, providers, collections }`) and writes the union of its names into `#pikku/addon`, so an editor completes the valid names and `tsc` rejects one the addon does not declare. A name the addon does not declare is also a build error (PKU374) that lists the names it does. An addon whose meta is not installed types its names as plain `string`. A list the inspector cannot read statically is PKU373. Naming one provider twice is the same as naming it once.

An addon with only providers (no functions) is valid: `wireAddon` wires it and the runner imports the provider without bootstrapping addon functions.

The providers reach your app as the second argument of `createSingletonServices(config, existingServices)`. A key an opted-in provider provides is typed as present in `existingServices`, and the runner merges what your factory returns over the injected keys, so a factory returns only what it adds. A key it returns that an opted-in provider also provides replaces the injected one and prints a shadow warning.

An addon publishes its providers by exporting `defineProvider` consts and running `pikku all`, which writes the meta. Ship `.pikku` in the package's `files` and export `./.pikku/*`, as for any addon metadata.

### What an addon provider can reach

An addon provider is held to the declarations its addon makes, with the same limits the addon's own functions get. This is enforced for the pieces below and for nothing else.

- **`env`.** Its `env` argument holds only the names its addon declares with `defineVariable` or `defineSecret`, and reading anything else throws `env-denied`. `variableOverrides` and `secretOverrides` on `wireAddon` rename what the addon reads (`{ NATS_URL: 'STAGE_NATS_URL' }` makes `env.NATS_URL` read the host's `STAGE_NATS_URL`). `Object.keys(env)` lists only the allowed names. A project's own providers read the raw `env`.
- **`credentialService` and `content`.** An addon provider that needs one gets the scoped version: `credentialService` limited to the credentials the addon declares plus its `credentialGrants` and `credentialOverrides`, and `content` limited to the addon's own folder plus its `contentGrants`. `globalCredentials` and `globalContent` on `wireAddon` hand it the host's service instead.
- **`onServerStart`.** It receives a frozen view of the provider's declared needs, the keys it provides and `logger`. Reading any other key throws `undeclared-read`.

Not enforced: `process.env` (and `env` from `cloudflare:workers`) stays global, and so does any module an addon imports. Providers run in your process, so this limits an honest addon that reads more than it declared. It is not a sandbox. `secrets` and `variables` are not narrowed for a provider that needs them: declare the need and review it in the lock.

### The lock

The first `pikku all` that sees an opted-in addon provider records its surface in `pikku-addons.lock`, which you commit: its package and version, a hash of its meta, what it provides, which keys it imports (needs), what it adds to and what it replaces. A later build compares each addon provider with its entry.

- A changed surface, such as a new need, a new provided key or a new `replaces`, fails with PKU395 and a diff. Review it, then run `pikku all --approve-providers=<id>[,<id>]`, or `--approve-providers` last on the command line to approve everything.
- A version or hash change with an identical surface is rewritten without a message. Version and hash are not part of the approved surface.
- A provider you stopped opting in to is dropped from the lock.
- `pikku all --frozen` refuses to write the lock: a new entry, an entry whose surface changed, a removed one, or a lock not in the form pikku writes it is PKU396. A version or hash change with an identical surface is accepted and the approved entry is kept, so a release that only bumps versions builds in CI without regenerating the lock. `CI=true` implies `--frozen`.
- A project with no addon providers, and a lock with none, is never checked or rewritten: a lock written before the `providers` section existed is read as having none.

Hand-editing the lock to grant more does not widen what a provider can read at run time: the runtime view is always the declared needs.

### Hosts that inject an addon

A host that adds an addon on the project's behalf (CI, Pikku Studio) writes a host-owned, gitignored wiring file in the project's source tree containing `wireAddon({ name, package, providers })`. There is no config-file route for providers: a config cannot carry source.

## Teardown and the server lifecycle

- `onServerStart(services)` runs where the server lifecycle runs, after every provider is built and before the app's `beforeStart`, in dependency order. A hook that throws aborts startup with a `ProviderError` of kind `start-failed`: `Provider 'x' failed in onServerStart: ...`.
- Teardown is the value's own `stop()`. `stopSingletonServices` calls it in reverse resolved order, once per object however many keys hold it, and a `stop()` that throws is logged without stopping the rest. A provider that replaces a baseline key stops with its provider, before what it needs, not at the baseline's position. Collection items stop in reverse resolved order with the rest. To make one provider stop before another, make it need the other.
- Per request, when the function returns or throws: the invocation's `auditLog` and `analytics` flush first, then the project's wire services stop (last built first, `stopWireServices`), then the wire providers stop in reverse resolved order. A wire provider's `stop()` therefore runs after the audit flush: audit writes it makes while stopping are not flushed.

## What runs where

| Target                                                | `dev` variant | `deploy` variants | `onServerStart`                                                                          |
| ----------------------------------------------------- | :-----------: | :---------------: | ---------------------------------------------------------------------------------------- |
| `pikku dev`                                           |      yes      |         -         | runs                                                                                     |
| `pikku serve`                                         |      yes      |         -         | runs                                                                                     |
| Generic server entry (provider-agnostic)              |       -       |        yes        | runs                                                                                     |
| Standalone (`@pikku/deploy-standalone`)               |       -       |        yes        | runs                                                                                     |
| Cloudflare container (`target: 'server'`)             |       -       |        yes        | runs                                                                                     |
| Cloudflare Worker                                     |       -       |        yes        | build error                                                                              |
| Other providers (`deploy-serverless`, `deploy-azure`) |       -       |        no         | a provider without `serviceSupport` fails the build when the project declares a provider |

`pikku dev` and `pikku serve` load `.pikku/providers/pikku-dev-providers.gen.ts`, written by `pikku all`, and spread what it builds over the local services before `createSingletonServices` runs, so a provided service beats the local one. Both skip it when `NODE_ENV=production`. A provider with only a deploy variant is an error on dev unless it provides only keys the dev baseline already holds.

A Worker (or any handler that is not a long-running server) never runs the server lifecycle. A selected provider with `onServerStart` there would silently never start, so it is a build error naming the provider and the unit (PKU389).

## Deploy providers (adapter authors)

A deploy provider tells provider resolution what a unit's runtime holds through `ProviderAdapter.serviceSupport(ctx)`:

```ts
interface ServiceSupport {
  baseline: readonly string[] // keys the entry holds before any provider runs
  profile: ProviderProfile // picks deploy:<profile> over deploy
  entryOwned: readonly string[] // keys the entry opens itself; no provider may replace them
  runsServerLifecycle: boolean // REQUIRED: does the entry call onServerStart?
}
```

- A deploy provider **without** `serviceSupport` runs no providers. The build fails if the project declares or opts in to one that runs on deploy.
- `baseline` is handed to the generated runner as `runtime`. The runner builds every provider on a copy of it and returns the whole bag.
- `runsServerLifecycle` is required, so a new deploy provider has to decide. `false` makes `onServerStart` a build error.
- The build writes `platform-services.gen.ts` beside each unit's entry and sets `ctx.platformServices`. The entry imports `createPlatformServices(env, runtime)`, calls it, and passes the result to `createSingletonServices`. `@pikku/deploy` exports `entryLifecycleVariable` and `composedLifecycleLines` so an entry wires the composed lifecycle the same way every other entry does. The file is removed when no provider is selected.

## Column coercion

When the app has a coercion map (from `pikku db generate`) and a provider provides `kysely`, the generated runner wraps that provider so the `kysely` it returns carries `createCoercionPlugin` from `@pikku/addon-kysely`, before any provider that needs `kysely` runs. A deployed query then returns the same Date, boolean and parsed JSON values it does under `pikku dev`. No provider selects anything for this, and a baseline `kysely` is the entry's own and is not wrapped. See [`db-column-annotations.md`](./db-column-annotations.md).

## Errors at a glance

| You wrote                                                                      | The build says |
| ------------------------------------------------------------------------------ | -------------- |
| A `defineProvider` the inspector cannot read, an unknown variant key           | PKU369         |
| A destructure with a rest element, a computed key or the whole services object | PKU371         |
| A return type that is not an object with known keys                            | PKU372         |
| `wireAddon({ providers })` with a non-literal list                             | PKU373         |
| An opt-in name the addon does not declare                                      | PKU374         |
| Variants given by reference exported from one module                           | PKU375         |
| The same exported provider name twice                                          | PKU376         |
| `deploy:<profile>` with an unknown profile                                     | PKU377         |
| `optional` that is not an array of literals or names an undestructured key     | PKU378         |
| A collection declared twice, or `addTo` something that is not a collection     | PKU379         |
| A provider that provides nothing and adds to nothing                           | PKU380         |
| `providers` on `wireRemoteAddon`                                               | PKU381         |
| `replaces` naming a key no variant provides                                    | PKU382         |
| `addTo` on a wire provider                                                     | PKU383         |
| Any `wire*` call inside a function                                             | PKU367         |
| Two providers providing one key                                                | PKU385         |
| A need nothing provides                                                        | PKU386         |
| Needs and provides forming a loop, including a self-loop                       | PKU387         |
| A reached provider with no variant for the target                              | PKU388         |
| `onServerStart` on a Worker unit                                               | PKU389         |
| A function needing a key nothing provides on its unit                          | PKU390         |
| A need on a key provided only sometimes, not listed in `optional`              | PKU391         |
| A singleton provider needing a per-request key                                 | PKU392         |
| A wire key a singleton already holds                                           | PKU393         |
| A protected key provided without `replaces`                                    | PKU394         |
| An addon provider whose surface differs from `pikku-addons.lock`               | PKU395         |
| `--frozen` (or `CI=true`) with a lock that has to change                       | PKU396         |
| A provider replacing a key the entry opens itself                              | PKU397         |
| A provider providing a collection's name                                       | PKU398         |
| A wire provider providing `auditLog`, `analytics`, `session` or `rpc`          | PKU399         |
