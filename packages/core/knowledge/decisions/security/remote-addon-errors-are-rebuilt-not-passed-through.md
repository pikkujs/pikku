---
type: decision
title: Remote addon errors are rebuilt, not passed through
description: A failed wireRemoteAddon call is rebuilt as a PikkuError this host registers, or a generic error for the status — the host's body never reaches the caller, and a 5xx is logged here and reported as RemoteAddonFailedError
tags: rpc, remote, errors
---

# Remote addon errors are rebuilt, not passed through

`invokeRemoteAddonFunction` in `packages/core/src/wirings/rpc/rpc-runner.ts`
calls a host this app does not run. Whatever it answers ends up in this app's
own error response, so the answer is treated as untrusted text.
`remoteAddonResponseError` turns a non-2xx response into one of:

- **a 4xx naming a `PikkuError` registered here with the same status** — that
  class, rebuilt with the host's message. The host chose to show that message
  to its caller, and the class lets this app's code `instanceof` it. It is
  rebuilt from the prototype without running the constructor, because the
  constructor's arguments are not on the wire.
- **any other 4xx, or a body that is not JSON** — the standard error for the
  status (`NotFoundError`, `ForbiddenError`, …) with its registered message and
  nothing from the body. A 4xx with no standard class becomes
  `RemoteAddonFailedError`.
- **a 5xx** — `RemoteAddonFailedError` (502), with the status and the first
  1000 characters of the body logged on this host.

A host that cannot be reached, or answers 2xx with a body that is not JSON, is
logged and reported as `RemoteAddonFailedError`. A call that outlives the
wiring's `timeoutMs` (default 30s) is aborted and reported as
`RemoteAddonTimeoutError` (504).

The previous behaviour attached up to 300 characters of the host's body to a
`RemoteAddonRequestError` message. A host's stack trace, SQL or internal
hostnames then reached this app's caller verbatim, and every remote failure was
the same class, so the consumer could not tell a validation error from an
outage.

**What this rules out:** passing any part of a remote body through to the
caller other than a registered error's own message; matching an error by name
alone, which would let a host label a 500 as this app's `ForbiddenError`; and
leaving a remote call without a deadline.
