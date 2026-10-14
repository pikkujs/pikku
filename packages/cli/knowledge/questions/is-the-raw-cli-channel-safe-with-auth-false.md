---
type: question
title: Is the raw CLI channel safe with auth false?
description: cliRaw is declared auth false yet runs every command as the channel session, so its safety rests on how the channel upgrade authenticates, which this file does not show
tags: cli, channels, auth, cli-wiring
---

# Is the raw CLI channel safe with auth false?

`cliRaw` in `packages/cli/src/functions/wirings/cli/serialize-channel-cli.ts` is declared `auth: false` (`serialize-channel-cli.ts:171-172`).
Its body passes the channel's `session` to `handleRawCLI` (`serialize-channel-cli.ts:174-186`). The comment says the
connection authenticated during its upgrade and commands run as it (`serialize-channel-cli.ts:185`).

Each command is stripped again by its own runner, and the comment says nothing gains access it would not have over HTTP
(`serialize-channel-cli.ts:178-182`).

The doc comment above `cliRaw` gives the design of the forwarding but not why an unauthenticated declaration is safe
(`serialize-channel-cli.ts:162-170`). This file does not show what the upgrade does when no session is present, so whether
an unauthenticated connection can reach `handleRawCLI` with a session of null is not answered here. The code is kept as
written until the upgrade path is read.
