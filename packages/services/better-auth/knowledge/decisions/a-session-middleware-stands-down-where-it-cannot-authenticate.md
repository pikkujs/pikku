---
type: decision
title: A session middleware stands down where it cannot authenticate
description: Global middleware runs on addon dispatches too, and an addon's scope deliberately withholds the host's auth secret and auth instance — so the absence is the normal case, not a fault
tags: [better-auth, session, addons, middleware]
---

# A session middleware stands down where it cannot authenticate

Both `betterAuthSession` and `betterAuthStatelessSession` return `next()`
without doing anything when the thing they need is not in scope:

- `betterAuthSession` when `services.auth` is not a function.
- `betterAuthStatelessSession` when reading `BETTER_AUTH_SECRET` throws
  `Access denied to secret key` — which `isSecretForbidden` recognises.

Global middleware is application-wide, so it also runs on dispatches contributed
by an addon. An addon runs with a `ScopedSecretService` whose namespace is
deliberately not granted the host application's auth secret, and it builds its
own singleton services rather than inheriting the host's better-auth instance.
Neither absence is a misconfiguration: they are what scoping is *for*. Treating
them as errors turned every addon dispatch into a failed call — an MCP tool
invocation coming back as an error the caller could do nothing about.

Standing down also leaves the chain intact, so a bearer-token middleware further
along can still authenticate the same request.

The distinction is kept sharp on the secret path: `isSecretNotFound` still logs,
because a secret that is *missing* in the root namespace really is a
misconfiguration, and a genuine failure — the secret store being unreachable —
still rejects.

**What this rules out:** treating "the service is not here" as "the service
failed". It also rules out making global middleware addon-aware; the middleware
does not need to know which scope it is in, only whether it can do its job.
