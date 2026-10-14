---
type: decision
title: The generated isThreadOwner check denies a missing thread the same as a foreign one
description: The public agent's thread ownership permission returns false when the thread does not exist, so a caller cannot tell a missing thread from another user's
tags: cli, agents, permissions
---

# The generated isThreadOwner check denies a missing thread the same as a foreign one

The public agent serializer in `packages/cli/src/functions/wirings/agent/serialize-public-agent.ts`
emits `isThreadOwner`. The comment says thread reads are keyed by a caller-supplied `threadId`, so
ownership comes from the session and is checked against the stored thread's `resourceId`
(`serialize-public-agent.ts:82-86`).

The permission loads the thread (`serialize-public-agent.ts:89`). When it is missing, it returns
`false` (`serialize-public-agent.ts:90-92`). The comment says this is deliberate: a missing thread is
denied rather than 404'd, so it cannot be told apart from one owned by someone else. Otherwise it
returns `canAccessThread(thread.resourceId, session)` (`serialize-public-agent.ts:93`).

**What this rules out:** a not-found response on this path, which would let a caller probe which
thread ids exist.
