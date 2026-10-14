---
type: question
title: Should a run without actors use the same credential order as the CLI?
description: The runtime resolvePersonas takes a wired sign-in hook or else the root actor secret, with a different default sign-in path, while the CLI prefers an operator token and per-persona secrets
tags: core, scenario, personas, sign-in
---

# Should a run without actors use the same credential order as the CLI?

When a scenario run starts without actors, `PikkuScenarioService.resolvePersonas`
in `packages/core/src/wirings/workflow/pikku-scenario-service.ts` builds them. It first asks whether a persona sign-in hook is wired
(`getWiredPersonaSignIn() !== null`, line 678). When one is, the root secret is
not read at all (lines 679-681). Otherwise it reads `SCENARIO_ACTOR_SECRET`
(line 681) and passes the root secret straight through. It requires `API_URL`
(line 682) and takes `APP_URL` for the environment (line 700). It never reads
`FABRIC_OPERATOR_TOKEN` or `PIKKU_PERSONA_SECRETS`. Its sign-in and RPC paths come
from `SCENARIO_SIGN_IN_PATH` and `SCENARIO_RPC_PATH` (lines 693-696). The sign-in
default is `/api/auth/sign-in/actor`.

The wired hook changes what the runtime path hands on. With a hook wired, `secret`
stays unset and is left out of the config (`pikku-scenario-service.ts:679-681`,
`:706`), and the run proceeds with no secret when `API_URL` is set (`:683`). The
sign-in path it resolves (`:693-695`, default `/api/auth/sign-in/actor`) is passed
to the hook as `signInPath` (`packages/core/src/services/http-personas.ts:118-122`).
`HttpPersona` then builds the hook's sign-in in place of the operator and secret
paths (`http-personas.ts:174`, `:184`), and throws if the config also holds a
`secret` or an `operator` (`http-personas.ts:175-183`), so the runtime path avoids
that clash only because it never sets an operator and drops the secret itself. The
doc on `wirePersonaSignIn` says the operator token and the actor secret are "not
read at all" when the hook is set (`packages/core/src/wirings/persona/wire-persona-sign-in.ts:9-10`).

The CLI path in `packages/cli/src/utils/persona-credentials.ts`
(`resolvePersonaCredentials`) takes a wired hook first, then the operator token,
then the per-persona list, then the root. Its default sign-in path comes from
`HttpPersona`, which is `/auth/sign-in/actor`.

A deployed stage with only an operator token therefore cannot run actors through
the runtime path, and a run that holds a narrowed list still gets the root from
that path. Whether the runtime path is meant to be a separate, root-only fallback
is not stated in the code. The `/api` default differs from the CLI's, which
suggests the two were written separately.

What is asked: should the runtime path resolve credentials the same way the CLI
does, and should the two share one default sign-in path?
