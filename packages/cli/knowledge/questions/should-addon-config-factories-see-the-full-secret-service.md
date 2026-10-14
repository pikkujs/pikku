---
type: question
title: Should addon config factories see the app's full secret service?
description: pikkuAddonConfig hands an addon's config factory a TypedSecretService over the parent app's secret service, with no per-addon scope applied in the generated code
tags: cli, addons, secrets, scopes
---

# Should addon config factories see the app's full secret service?

The generated `pikkuAddonConfig` in `packages/cli/src/functions/wirings/functions/serialize-addon-types.ts` receives the
parent's services (`serialize-addon-types.ts:117-122`). It destructures `secrets` and `variables` from them and passes
`new TypedSecretService(secrets)` into the addon's own factory (`serialize-addon-types.ts:121-122`).

The `AddonBaseServices` type gives the addon `secrets: TypedSecretService` from the parent (`serialize-addon-types.ts:106-110`).
The constructor of `TypedSecretService` in `packages/core/src/services/typed-secret-service.ts:37-45` takes the parent's
secret service and the credential metadata, and no addon name or scope list. Its `getSecret` looks up the key and handles
optional credentials (`typed-secret-service.ts:47-56`).

So the code gives an addon config factory the whole secret service of the app, typed but not scoped to the addon. The
triage's reading was that this is unintended. The code does not show the intent either way, and no test or comment in this
file records it. The question is whether a scoped view was meant, and the current behaviour is kept until that is decided.
