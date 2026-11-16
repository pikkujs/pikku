---
type: decision
title: Admin secret plaintext is revealed in one place, SecretAdminService.read
description: SecretAdminService is the only admin code that calls reveal() on a secret, so the plaintext disclosure can be found by grepping for one call; secretGet returns that read under admin:secrets:read and secretHas never returns a value
tags: admin, secrets, security
---

# Admin secret plaintext is revealed in one place, SecretAdminService.read

`SecretAdminService` (`packages/addon/pikku-admin/src/services/secret-admin.service.ts`) wraps the host's
`SecretService`. Its comment says that wrapping it there "makes the plaintext disclosure
a single greppable `.reveal()` rather than one per function".

The host supplies `secrets` and `services.ts` forwards it into the wrapper (see
[the host supplies the admin services](the-host-supplies-the-admin-services-and-the-addon-builds-none.md)).
The wrapper is the one thing the addon constructs, and it is needed because the function runner
strips `secrets` from the services a function receives, so a function cannot read it directly.
It holds no store and decides nothing about where secrets live.

`read` returns `{ exists: false, value: null }` for an unknown secret, and otherwise
returns `secret.reveal()` as `value`. `has` calls only `hasSecret`, so it never loads
the value.

Three functions use it, each `expose: true`:

- `secretGet` (`src/functions/secret-get.function.ts`) is gated by `admin:secrets:read`
  and returns `SecretAdminService.read` unchanged, so a holder of that scope receives the plaintext.
- `secretHas` is gated by `admin:secrets:read` and returns only `{ exists }`.
- `secretSet` is gated by `admin:secrets:write`. Reading and overwriting are separate
  grants: a holder of only the read scope is refused.

These functions moved from `@pikku/addon-console`, where they were
`pikku:console:secrets:read|write`. The RPC names changed from `console:secretGet`,
`console:secretHas` and `console:secretSet` to `admin:secretGet`, `admin:secretHas`
and `admin:secretSet`.

**What this rules out:** a second function or service that reveals a secret value,
reaching the `SecretService` from a function body,
and a `secretHas` that returns the value.
