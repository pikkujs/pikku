---
type: decision
title: Agent credential status is read for the caller's own session user only
description: agentCredentialCheck takes the user id from the session and never from input, and reads the agent from running state, so a caller cannot probe another user's connected credentials
tags: admin, agents, credentials
---

# Agent credential status is read for the caller's own session user only

`agentCredentialCheck` (`packages/addon/pikku-admin/src/functions/agent-credential-check.function.ts`)
reports which OAuth credentials an agent needs and whether they are connected. It
is gated by `admin:credentials:read`, beside `credentialStatus`. It moved here from
`@pikku/addon-console`, which keeps a deprecated copy until the console is removed.

The user id comes from the session (`session?.userId`) and the input is only
`{ agentName: string }`, so a caller cannot probe another user's connected
credentials. Connection status is `credentialService.has(name, userId)`.

The agent's tools come from `pikkuState(null, 'agent', 'agentsMeta')`, not from
`.pikku` files on disk, so the function works in a deployed stage, which is what
this addon is for.

**What this rules out:** a `userId` parameter on this function, and reporting the
connection status of any user other than the session's.
