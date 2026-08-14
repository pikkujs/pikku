---
type: decision
title: Resuming a suspended agent run re-runs the agent's authorization gate
description: Ownership of the run is not enough — a grant revoked while the run was suspended must block the approval
tags: agent
---

# Resuming a suspended agent run re-runs the agent's authorization gate

Both `resumeAgent` (`agent-stream.ts`) and `resumeAgentSync`
(`agent-runner.ts`) call `assertAgentAuthorized` after asserting run
ownership and before touching `agentRunState.resolveApproval`.

Ownership proves the run belongs to the caller, not that the caller may still
act on it: a suspension can outlive the permission that created it, and the whole
point of an approval gate is that the person approving is authorized at the
moment of approval. Resolving an approval is a persisted side effect, so the
gate must run before it, not after.

**What this rules out:** treating the ownership assertion as the complete
authorization check on the resume paths, and moving `assertAgentAuthorized`
below `resolveApproval` for convenience.
