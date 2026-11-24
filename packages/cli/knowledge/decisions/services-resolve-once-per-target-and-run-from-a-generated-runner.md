---
type: decision
title: Services resolve once per target and run from a generated runner
description: One resolver reads the inspector's pikkuServices for pikku dev and for each deploy unit, and writes a runner that imports only the selected variants; pikku all also generates the merged SingletonServices type
tags: [cli, pikku-service, services, deploy, dev]
---

# Services resolve once per target and run from a generated runner

`resolvePikkuServices` is the one resolver. It reads what the inspector recorded
(the project's `pikkuService` consts and the ones opted in with
`wireAddon({ services })`), never loads user code, and hands core's
`ServiceRegistry` the target and its baseline: what `pikku dev` injects
(`devBaselineServices`), or what the deploy provider's entry holds
(`ProviderAdapter.serviceSupport`, `{ baseline, runsServerLifecycle }`).

`serializePikkuServices` writes the runner. It imports a variant that lives in a
module of its own alone, so a `dev` variant never reaches a deploy bundle, and
exports `createPlatformServices(env, runtime)` and `serverStartHooks`. Dev
writes `pikku-dev-services.gen.ts`; each deploy unit writes
`platform-services.gen.ts` beside its entry, or removes a stale one when the
unit runs no service.

**Errors the build owns.** A service with no variant for a target is an error
unless every key it provides is already in that target's baseline. A selected
service with `onServerStart` on a target whose `runsServerLifecycle` is false (a
Worker) is an error. A provider with no `serviceSupport` runs no service, so a
project that declares one fails there.

**Column coercion.** When the app has a coercion map and a service provides
`kysely`, the runner wraps that service's factory so the `kysely` it returns
carries `createCoercionPlugin` from `@pikku/kysely`. It is the generator's job,
not each provider's, so every deploy target returns the same Date, boolean and
parsed JSON values `pikku dev` does. A baseline `kysely` is the entry's own and
is not wrapped.

**`SingletonServices`.** `pikku all` generates `#pikku/service`: the type the
project declared plus every key a service provides, as required properties with
no `any`. `#pikku/function`'s `SingletonServices` is this merged type, and
`pikkuService` is typed against it.

**What this rules out:** a provider-specific selection step, a service chosen at
runtime, and a config list of services (`dev.services` and `deploy.services` do
not exist; declaring in code is the only route).
