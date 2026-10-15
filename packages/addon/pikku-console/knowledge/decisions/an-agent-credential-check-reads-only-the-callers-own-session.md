---
type: decision
title: Agent credential status is read for the caller's own session user only
description: agentCredentialCheck takes the user id from the session and never from input, so a caller cannot probe another user's connected credentials
tags: console, agents, credentials
---

# Agent credential status is read for the caller's own session user only

`agentCredentialCheck` (`packages/addon/pikku-console/src/functions/agent-credential-check.function.ts`)
reports which OAuth credentials an agent needs and whether they are connected. It
is gated by `pikku:console:credentials:read` (`agent-credential-check.function.ts:19`).

The user id comes from the session: `const userId = session?.userId`
(`agent-credential-check.function.ts:27`). The comment says "never accept an
arbitrary userId from input, which would let a caller probe another user's connected
credentials" (`agent-credential-check.function.ts:25-26`). The input type is only
`{ agentName: string }` (`agent-credential-check.function.ts:12`).

Connection status is then computed with `credentialService.has(name, userId)`
(`agent-credential-check.function.ts:58-60`).

**What this rules out:** a `userId` parameter on this function, and reporting the
connection status of any user other than the session's.
