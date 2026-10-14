---
type: question
title: Does a wireCLI command need a session when it sets no auth?
description: The channel default is documented as requiring a session, but a CLI command has no default of its own; its session need comes from whether the function is sessionless
tags: core, cli, auth
---

# Does a wireCLI command need a session when it sets no auth?

For channels, an absent `auth` requires a session. `packages/core/src/wirings/channel/channel.types.ts:67-76`
and `packages/core/src/wirings/channel/channel-runner.ts:142` both say so.

`wireCLI` in `packages/core/src/wirings/cli/cli-runner.ts` copies `auth` and
`permissions` from the function (`:89-90`, `:105`). It merges a command-level
`auth` onto the registration as `commandAuth ?? existing.auth` (`:176`, `:190`,
`:201`). No default is set anywhere in that path.

When the command runs, `runPikkuFunc` is called with `auth: false` (`:393-397`).
In `packages/core/src/function/function-runner.ts:385-404`, a sessionless function
requires a session only when the wiring or the function sets `auth: true` (`:386-392`).
A function that is not sessionless always requires one and throws when there is none
(`:401-403`). `auth: false` on such a function only logs a warning (`:396-400`).

**Question:** should a CLI command with no `auth` require a session as a channel
does? The code does not set that default for CLI commands. Whether a command needs
one depends on whether the function is declared sessionless.
