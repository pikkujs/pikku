---
type: decision
title: BETTER_AUTH_SECRET is always declared as a required secret
description: The generated auth secrets file declares BETTER_AUTH_SECRET without optional: true, so the platform collects it for every project that uses pikkuBetterAuth regardless of providers
tags: cli, auth, secrets, deploy
---

# BETTER_AUTH_SECRET is always declared as a required secret

`serializeAuthGen` in `packages/cli/src/functions/wirings/auth/serialize-auth-gen.ts` writes a
`defineSecret` for `BETTER_AUTH_SECRET` into the secrets file, on every run and independent of
the configured providers (`serialize-auth-gen.ts:127-137`). The comment says the secret is always
required and is wired so the platform collects it (`serialize-auth-gen.ts:127-128`).

The declaration has no `optional` field, unlike the OAuth proxy secrets just below it, which are
marked `optional: true` (`serialize-auth-gen.ts:184-186`). A project that uses better-auth therefore
needs this value at deploy time.

**What this rules out:** a better-auth project that starts without a session-signing secret and
fails at its first sign-in instead of at deploy.
