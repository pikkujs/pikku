---
type: decision
title: The unlock gate is served over HTTP, never prompted natively
description: The server boots locked and serves an unlock page, so a desktop build and a headless `pikku serve` unlock the same way — which forces the routes open and makes locking take the passphrase
tags: core
---

# The unlock gate is served over HTTP, never prompted natively

A pikku app with classified columns boots **locked**: `DataLock`
(`packages/core/src/classification/data-lock.ts`) holds no key at construction,
`getKEK` throws `DataLockedError`, and the passphrase arrives over HTTP long
after singleton services are built. `wireDataLock`
(`@pikku/core/data-lock`) registers the four routes an unlock screen talks to,
and the screen itself is a page in the application's own frontend.

The alternative was a native prompt in the desktop shell, which was the obvious
shape given the desktop build is where this feature started. It was rejected
because it splits the story in two. A desktop shell can prompt; a headless
`pikku serve` on a box somewhere cannot, and would have been left with nothing.
Keeping the gate on HTTP means both shapes unlock identically and share one
screen, and it keeps the passphrase out of the environment and out of the
process table — the desktop shell never sees it, so the Rust side of the app
holds no key material at all.

Three consequences fall out of that, and each of them looks wrong in isolation.

**Every lock route is `auth: false`.** The gate cannot sit in front of its own
key: a session may itself live in a column this lock is holding shut, so
requiring one to unlock would make a locked store impossible to open.

**Static mounts serve before route dispatch**, so the frontend that hosts the
unlock screen is reachable while everything behind it is refused. That ordering
already existed for the console; it is load-bearing here.

**Locking takes the passphrase.** `POST {prefix}/lock` re-derives the key before
clearing it, which reads like ceremony for an operation that only destroys
state. Without it, an open POST is a one-request denial of service against any
headless deployment: the store shuts and stays shut until somebody is physically
around to type the passphrase back in. Proving ownership is what makes an
unauthenticated lock endpoint safe to publish.

**What this rules out:** a passphrase passed to the server as an environment
variable or argument, a native prompt in any shell, and gating the lock routes
behind `requireUnlocked` or any session requirement. It also rules out treating
first-run `initialize` as authenticated — a store nobody has initialized has no
identity to check against, which is why the desktop case binds to localhost.

Related: [[unlock-attempts-are-throttled-because-the-endpoint-is-open]],
[[core-secrets-use-a-per-secret-dek-wrapped-by-a-kek]].
