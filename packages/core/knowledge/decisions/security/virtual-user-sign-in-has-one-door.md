---
type: decision
title: Virtual user sign-in has one door, reached two ways
description: Only the app's virtual user sign-in handler creates a virtual user session; runs reach it in-process and everything else reaches it with a signed statement
tags: services
---

# Virtual user sign-in has one door, reached two ways

The `signIn` closure in the Better Auth virtual user plugin
(`packages/services/better-auth/src/virtual-user-plugin.ts`) is the only thing that
creates a virtual user session. It refuses any user row not flagged `virtualUser`,
creates a row only under `pikku dev` (`mayProvision`), and sets the session cookie.
Every route below ends in it; nothing else mints a session for a virtual user.

**Runs go in-process.** A run — started by a person, or by the scheduled tick as
`pikku-platform` holding only `virtualUser:run` — already executes inside the app, so
it has nothing to prove to itself. It calls `auth.api.signInVirtualUserInternal`, an
endpoint marked `metadata: { SERVER_ONLY: true }`: better-call leaves it out of the
router, so `auth.handler` answers 404 for its path while `auth.api` can still call it.
The seam is `services.auth`, which core already types structurally, so core imports
nothing from Better Auth and a project without it gets an error that says so.

**Everything outside the app presents a signed statement** — see
[an external caller presents one signed statement](an-external-virtual-user-caller-presents-one-signed-statement.md).
That covers the dev switcher, `pikku scenario run`, `pikku virtual-user run` and
`rpc`, `pikku pages screenshot --as`, and the Playwright provider.

Two choices fall out of this and are deliberate:

- **Cookie, not bearer.** The run takes the `Set-Cookie` values from the in-process
  call into the cookie jar core already has, then drives the app over HTTP with it.
  Apps do not register Better Auth's bearer plugin and this does not make them.
- **A public URL, not a service binding.** The run is a queue worker unit and the
  existing bindings carry RPC, not HTTP. It reads `VIRTUAL_USER_API_URL` from
  variables; `pikku dev` sets it once the port is bound, and a stage's deployer sets it
  there. A missing value fails the run naming the variable. The same variable works on
  a dev machine, a node box and a Worker.

**What this rules out:** a second sign-in route with its own checks, a credential that
is shared with, or derived for, a caller inside the app, and a bearer token handed
back to a run.
