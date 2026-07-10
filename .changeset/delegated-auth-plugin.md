---
'@pikku/better-auth': patch
---

Add the `delegatedAuth()` plugin: `POST /sign-in/delegated` verifies a user's existing credentials against an imported upstream API (via an `authenticate` callback), JIT-provisions a real user keyed by a `providerId: 'delegated'` account row, persists the upstream token per-user (`storeCredential`, before the session is minted), and refreshes name/role on every sign-in. Passwords are never stored.
