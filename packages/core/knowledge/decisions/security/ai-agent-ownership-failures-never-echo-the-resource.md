---
type: decision
title: An agent ownership failure never echoes the resource it refused
description: assertResourceOwner throws a bare ForbiddenError so the error cannot be used as an existence oracle, at the cost of thinner debugging output
tags: ai-agent
---

# An agent ownership failure never echoes the resource it refused

`assertResourceOwner` in
`packages/core/src/wirings/ai-agent/ai-agent-prepare.ts` compares a stored
thread/run `resourceId` against the caller's composed owner key and throws
`ForbiddenError('Not authorized to access this thread' | '… run')` on a
mismatch. The message deliberately carries no id.

Including the id would turn the endpoint into an existence oracle: a caller
enumerating thread ids could tell "exists but is not yours" apart from "does not
exist", which leaks the shape of other tenants' data even though no content is
returned.

**What this rules out:** improving the error message by interpolating the
`threadId`, `runId`, or owner key into it, and distinguishing not-found from
not-authorized on the read paths.
