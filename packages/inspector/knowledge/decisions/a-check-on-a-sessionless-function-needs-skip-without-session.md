---
type: decision
title: A check with no skipWithoutSession on a sessionless function is always PKU587
description: pikkuPermission and pikkuAuth refuse a call with no session, so on a sessionless function the check has to state that it skips, and only what can be resolved is reported
tags: [inspector, permissions]
---

# A check with no skipWithoutSession on a sessionless function is always PKU587

With no session, `pikkuPermission` and `pikkuAuth` do not run the check: they
refuse, or with `skipWithoutSession: true` they pass. A sessionless function is
the only function that can run with no session, because `runPikkuFunc` refuses
a `pikkuFunc` before permissions run. So without the option the check closes the
function to the callers it was written for, and that is only seen at runtime as a
403 on a job or a public route.

**Always a critical.** Unlike PKU586 it does not depend on `strictMeta`. The
function cannot do what it was written to do, whichever way the author meant it.

**What counts.** A function with `meta.sessionless === true` and no `auth: true`.
`auth: true` on a wiring does not exempt the function, because other wirings and
RPC can still reach it without one. A global permission counts against every
such function, and `pikkuWorkflowFunc` functions are among them, which is what
catches a global that would refuse the workflow orchestrator.

**What is not reported.** Anything that cannot be resolved has no flag to read:
a spread config, an option that is not a literal, a factory whose body is not a
function or a permission call, and an entry with no definition, such as one from
an addon or written inline in `permissions`. The visitor records these as
`skipWithoutSession: true` so finalize stays a plain read of the state.
A global registered for a named package, `addGlobalPermission([check], '@acme/addon')`,
is left out too: it reaches that package's functions, which are not in this
meta, and not the app's own.

**A key in an OR group is still reported**, even when another key of the group
would let the call through. Function meta flattens the group, and the check next
to a skipping key never runs for an anonymous caller, so it says nothing there.

**Agents are not covered.** `agent.permissions` run through `runPermissions` with
no session on an agent with no `auth: true`, and get the same refusal, but an agent
is not a sessionless function.
