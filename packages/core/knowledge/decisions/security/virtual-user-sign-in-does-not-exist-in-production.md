---
type: decision
title: Virtual user sign-in endpoints do not exist in production
description: The plugin registers the statement, in-process and switcher endpoints only when the sign-in gate is open at construction, and creating a row is dev-only
tags: services
---

# Virtual user sign-in endpoints do not exist in production

Virtual users never run in production, and the disposition and environment refusals
enforce that at request time. On top of them, the plugin resolves
`resolveVirtualUserSignIn()` once, at construction, and registers the statement
endpoint, `signInVirtualUserInternal` and the switcher only when the gate is open —
`pikku dev`, or the explicit stage opt-in. In production none of them is registered:
there is no route to refuse and no handler to reach through `auth.api`.

This replaces "always registered, refused per request" because a refusal is code that
has to be right on every request, while an endpoint that was never built cannot be
reached by a bug in it.

Creating a row stays under `pikku dev`. A stage signs in only to virtual users
provisioned at startup.

**What this rules out:** deciding at request time whether the endpoint exists, and
letting a stage create virtual user rows by signing in.
