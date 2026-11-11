---
type: decision
title: pikku dev runs every frontend with a dev command and owns the dev .env
description: pikku dev starts each frontend that sets dev.command beside the API, parses the root .env once for all of them, generates the secrets the app declares, and stops everything when any process dies
tags: cli, dev, frontends, env, secrets
---

# pikku dev runs every frontend with a dev command and owns the dev .env

`pikku dev` (`packages/cli/src/functions/commands/dev.ts`) starts every frontend in
`pikku.config.json` that sets `dev.command`, in that frontend's `cwd`, once the API is bound.
`--frontend a,b` narrows the set and `--no-frontends` runs the API alone. A frontend without
`dev.command` is skipped; naming one with `--frontend` is an error. Output is prefixed with the
frontend's name, each is waited on at its `healthPath`, and each gets `VITE_API_PROXY` pointing
at the port the API actually bound unless the environment already sets it.

The root `.env` is parsed by the CLI itself (`dev-env.ts`) and loaded into `process.env` without
replacing anything already set, so the API and every child see the same values. A frontend's own
`<cwd>/.env` overrides the root file for that child only, and the shell beats both. The pikku CLI
runs under a node shebang, so bun's implicit `.env` loading never reached it, and Better Auth
failed the first sign-up with "Requested secret not found".

After the first codegen, and before any service is built, the secrets the app declares are
appended to `.env` if they are missing: `BETTER_AUTH_SECRET` when the project defines
`pikkuBetterAuth` (32 random bytes, base64; the name list is `AUTH_GENERATED_DEV_SECRETS` beside
the generator), and any secret declared with `generate` (hex of its `size`). A required secret the
CLI cannot make up gets a warning naming it. An existing value is never replaced.

If any frontend process exits, `pikku dev` stops the API and the other frontends and exits
non-zero; a half-running stack reads as an app bug.

**What this rules out:** a per-project `scripts/dev.mjs` that re-implements env loading, secret
generation and process supervision, and a dev session where one frontend crashes unnoticed.
