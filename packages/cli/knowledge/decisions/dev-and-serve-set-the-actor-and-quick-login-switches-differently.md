---
type: decision
title: pikku dev turns actor sign-in and quick login on, and pikku serve turns actor sign-in off
description: The CLI defaults PIKKU_DEV_QUICK_LOGIN to true for both commands, but only dev enables the actor sign-in gate, and serve clears it with a warning
tags: cli, dev, serve, actor, quick-login
---

# pikku dev turns actor sign-in and quick login on, and pikku serve turns actor sign-in off

- `pikku dev` (`packages/cli/src/functions/commands/dev.ts`) sets
  `PIKKU_DEV_QUICK_LOGIN` to `true` if unset, then calls `enableDevActorSignIn`.
- `pikku serve` (`packages/cli/src/functions/commands/serve.ts`) sets the same
  quick-login default, then calls `disableDevActorSignIn`.

`enableDevActorSignIn` (`packages/cli/src/server/actor-sign-in.ts`) sets
`PIKKU_DEV_ACTOR_SIGN_IN=true`. Its secret comes from `SCENARIO_ACTOR_SECRET`
or the `VITE_` form when present, and otherwise a fresh 32-byte value is minted.
`disableDevActorSignIn` clears the flag and logs a warning.

**What this rules out:** a served build opening passwordless actor sign-in just
because a developer once ran dev, and dev needing a configured secret to start.
