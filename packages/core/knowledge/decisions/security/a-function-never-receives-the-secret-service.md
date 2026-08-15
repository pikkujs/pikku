---
type: decision
title: A function never receives the secret service
description: Every function-, permission- and auth-facing services type is bounded by SecretlessServices, so reaching for `secrets` in a function body is a type error rather than a lint
tags: services
---

# A function never receives the secret service

`SecretlessServices<Services>` is `Omit<Services, 'secrets'>`
(`packages/core/src/types/core.types.ts`), and
`CoreSecretlessSingletonServices` built from it is the constraint every
function-, permission- and auth-facing type is bounded by
(`packages/core/src/function/functions.types.ts`). Destructuring `secrets`
inside a `pikkuFunc` body does not lint — it does not compile.

The rule itself is older than the type: a function holding a `SecretService` can
read every secret in the vault, which makes its blast radius the whole vault
rather than the one credential it needs, and makes "which secrets does this
function depend on?" unanswerable. `[PKU950]` enforces the same confinement for
a `SecretService` reaching a function under an alias, because a rename does not
change what it is. Encoding it in the type is what makes the honest mistake
impossible rather than merely reported: secrets are resolved where things are
constructed — `pikkuServices`, `pikkuWireServices`, addon service factories,
middleware — and the function is handed the configured client.

The cost is that a function which needs to _ask about_ a secret rather than read
one — "is this key set?", for a readiness or provisioning check — cannot do it
directly either. It goes through a service that holds `secrets` and exposes only
that question, which is how `@pikku/addon-console` checks whether an installed
addon's declared secrets are present.

**What this rules out:** widening a function's services type back to
`CoreServices` for a function that "only needs one secret", and passing the
secret service through under another name — the type follows the shape and
`[PKU950]` follows the type. It also rules out treating the absence as an
oversight to be patched with a cast.
