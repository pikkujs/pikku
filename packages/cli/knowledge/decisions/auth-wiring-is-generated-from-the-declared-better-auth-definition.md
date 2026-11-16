---
type: decision
title: Auth wiring is generated from the declared pikkuBetterAuth definition, not from the provider count
description: The auth generator writes the /auth wiring, secrets and session middleware whenever a pikkuBetterAuth definition exists, so credentials-only auth with no OAuth providers still gets its wiring
tags: cli, auth, codegen, better-auth
---

# Auth wiring is generated from the declared pikkuBetterAuth definition, not from the provider count

The auth generator in `packages/cli/src/functions/wirings/auth/pikku-command-auth.ts` returns early
when the inspected project has no auth definition (`packages/cli/src/functions/wirings/auth/pikku-command-auth.ts:56`).
The comment there says the gate is the definition and not the provider count, so credentials-only
auth, which has no OAuth providers, still generates its `/auth/*` wiring (`pikku-command-auth.ts:53-55`).

When a definition exists, `serializeAuthGen` is called with the definition, the providers, the
generated file path and the package mappings (`pikku-command-auth.ts:58-64`).

The output goes to three files. The wiring goes to `authFile` and the secrets to
`auth-secrets.gen.ts` (`pikku-command-auth.ts:69-71`), kept apart because the CLI forbids Zod
schemas and HTTP wiring in one file (`pikku-command-auth.ts:66-68`). The session middleware goes
to `auth-middleware.gen.ts`, and that file is removed when no middleware is produced
(`pikku-command-auth.ts:74-77`, with the removal at `:78-79`).

**What this rules out:** gating auth codegen on the number of OAuth providers, which would leave a
credentials-only app with no `/auth` routes and no session middleware.
