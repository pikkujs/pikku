# Services

Services are what your functions destructure: a database client, a queue, a mail
client. They are built in ordinary code, in three layers.

| Layer     | Factory                  | Written by | Built                   | Reads the raw environment |
| --------- | ------------------------ | ---------- | ----------------------- | :-----------------------: |
| Platform  | `createPlatformServices` | the host   | once, before the app    |            yes            |
| Singleton | `pikkuServices`          | the app    | once, at startup        |            no             |
| Wire      | `pikkuWireServices`      | the app    | for each request or job |            no             |

An addon has its own singleton and wire factories (`pikkuAddonServices` and
`pikkuAddonWireServices`). It has no platform layer, and its factories never
receive the host's environment.

## Singleton and wire services

```ts
export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables ?? new LocalVariablesService()
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const queueService =
      existingServices?.queueService ?? (await makeQueue(secrets))
    return { config, variables, secrets, queueService }
  }
)

export const createWireServices = pikkuWireServices(
  async ({ logger }, wire) => ({
    audit: new AuditService(logger, wire),
  })
)
```

`existingServices` holds what the runtime built before your app, including
whatever the platform layer returned. Order and dependencies are the order of
your code.

Teardown is the service's own `stop()` on the value you return.
`stopSingletonServices` calls it in reverse of the order services were built,
addon packages first. Work to do once the server is up belongs in
`pikkuServerLifecycle`.

A service whose settings are missing at startup should throw. Do not fall back to
a stub.

## Host platform services

A host (a hosting platform, a local tool) can supply platform services from one
ordinary module:

```ts
import { pikkuPlatformServices } from '@pikku/core/lifecycle'

export const createPlatformServices = pikkuPlatformServices(
  async (
    env,
    services, // what the entry holds so far
    { requiredServices } // the services this unit, or pikku dev, reaches
  ) => ({
    queueService: new HostQueueService(env),
  })
)
```

The types default to Pikku's own services and a string `env`. Pass your own as
`pikkuPlatformServices<MyServices, MyEnv>`, for example to read Cloudflare
bindings.

- It runs last, and what it returns replaces what the entry holds. Return only
  what you provide.
- The app receives the result as `existingServices`. If the app returns its own
  service for one of those keys, the app's wins and `pikkuServices` logs a
  warning.
- `requiredServices` says what to construct.
- Teardown is each service's `stop()`.
- It is host code and reads the whole `env`. An addon's services never do.

**Choosing the module:**

- Deploy: the deploy provider implements `platformServicesModule(ctx)`.
- `pikku dev` and `pikku serve`: whoever starts the command passes
  `--platform-services <module>`, a package specifier resolved from the project,
  or a path. There is no config key: the host chooses. It may not replace
  `kysely` when the project has a `db` section.

On Cloudflare Workers, Cloudflare containers and the server entry, `createConfig`
receives the `variables` the module returns. In `pikku dev`, `pikku serve` and
standalone, the database is set up from the config before the module runs, so
`createConfig` does not see them.

## Providers (adapter authors)

A provider whose target needs its own services names a module:

```ts
platformServicesModule?(ctx: EntryGenerationContext): string | undefined
```

The build writes `platform-services.gen.ts` beside each unit's entry and sets
`ctx.platformServices`. The entry imports `createPlatformServices(env, runtime)`,
calls it, and passes the result to `createSingletonServices`. A unit with no
module gets no file.

## Column coercion

When the app has a coercion map (from `pikku db generate`) and the platform
module returns a `kysely`, the generated file attaches `createCoercionPlugin`
from `@pikku/kysely` to it. A deployed query then returns the same Date, boolean
and parsed JSON values it does under `pikku dev`. See
[`db-column-annotations.md`](./db-column-annotations.md).
