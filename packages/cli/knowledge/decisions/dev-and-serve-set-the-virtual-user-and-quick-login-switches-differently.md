---
type: decision
title: pikku dev turns virtual user sign-in and quick login on, and pikku serve turns virtual user sign-in off
description: The CLI defaults PIKKU_DEV_QUICK_LOGIN to true for both commands, but only dev enables the virtual user sign-in gate, and serve clears it with a warning
tags: cli, dev, serve, virtual-users, quick-login
---

# pikku dev turns virtual user sign-in and quick login on, and pikku serve turns virtual user sign-in off

- `pikku dev` (`packages/cli/src/functions/commands/dev.ts`) sets
  `PIKKU_DEV_QUICK_LOGIN` to `true` if unset, then calls `enableDevVirtualUserSignIn`.
- `pikku serve` (`packages/cli/src/functions/commands/serve.ts`) sets the same
  quick-login default, then calls `disableDevVirtualUserSignIn`.

`enableDevVirtualUserSignIn` (`packages/cli/src/server/virtual-user-sign-in.ts`) sets
`PIKKU_DEV_VIRTUAL_USER_SIGN_IN=true`. It loads the dev Ed25519 key pair kept under the
runtime dir, or creates it on first start, and puts only the public half into
`VIRTUAL_USER_VERIFY_KEY`, so statements the CLI signs in another terminal still verify
after a restart. `disableDevVirtualUserSignIn` clears the flag, and logs a warning when it
was set, pointing at `PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN` for a stage that is meant to run
scenarios.

**What this rules out:** a served build opening virtual user sign-in just because a
developer once ran dev, and dev needing a configured key to start.
