---
'@pikku/cli': patch
---

Declare `better-auth` as an optional peer dependency of the CLI.

`pikku db generate` resolves `better-auth` with `require.resolve` from the CLI's
own module so it can read the auth schema, but the CLI never declared it. Under
a hoisted install it happened to resolve through `@pikku/better-auth`, which
declares it as a peer; under a strict layout it does not resolve at all. Optional
so the vast majority of projects, which do not use Better Auth, still install
nothing extra — the same shape `@pikku/playwright` already has here.
