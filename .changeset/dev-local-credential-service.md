---
'@pikku/cli': patch
---

Give `pikku dev` a credential store.

Wiring a `credentialService` is the deployment's job — the values are per-user
secrets, and where they are encrypted and who holds the key is a decision only
the host can make. But that left `pikku dev` with none at all: `credentialService`
was `undefined`, so an addon imported with `--auth per-user` or `--auth delegated`
could not be exercised locally. The delegated sign-in a project is told to wire
threw on its first call, and projects were reaching for their own credential
tables to get past it.

`pikku dev` now builds a `LocalCredentialService` alongside the rest of its
in-memory services — the queue, the trigger service, the workflow service — and
hands it to `createSingletonServices` as an existing service. A project that
wants a real store overrides it there the same way it overrides any of the
others: `existingServices.credentialService ?? new OwnCredentialService()`.
