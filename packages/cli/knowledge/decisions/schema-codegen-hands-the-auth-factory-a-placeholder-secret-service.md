---
type: decision
title: Schema codegen hands the auth factory a placeholder secret service, so migrations never need the real secrets
description: The Better Auth schema introspection behind db migrate gives the auth factory a fake secret service that resolves every key to a placeholder, so no real secret value is read
tags: cli, db, better-auth, secrets
---

# Schema codegen hands the auth factory a placeholder secret service, so migrations never need the real secrets

Schema introspection for Better Auth runs the app's auth factory to read its options. `loadAuthFactory` finds the factory in the project source (`packages/cli/src/functions/db/better-auth-schema.ts:99-109`). The factory is then called with a services stub built by `schemaServicesStub` (`better-auth-schema.ts:153`, `:272`, `:281`).

That stub's `secrets` is `fakeSecretService()` (`better-auth-schema.ts:116-131`). `getSecret` returns one placeholder value, `hasSecret` answers `true` for every key (`:128`), and `setSecret` does nothing. `getSecrets` resolves every requested key to the same placeholder (`:124-127`). The comment there says a factory that batches its secrets must get the whole batch back, or it throws on the one it treats as required and the schema is never read.

The comment at `better-auth-schema.ts:111-115` gives the reason: the table and column shape does not depend on secret values, and the stub keeps the drift check in `pikku db migrate` from requiring `BETTER_AUTH_SECRET` and the other app secrets to be present in the environment.

**What this rules out:** passing real secret values into schema introspection, and making `db migrate` fail because an app secret is absent from the local environment.
