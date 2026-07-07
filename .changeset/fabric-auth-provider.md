---
'@pikku/better-auth': patch
---

Add the `fabric()` auth plugin: `POST /sign-in/fabric` mints an app-admin session
for a synthetic, `fabric: true` operator row (created with `role: 'admin'`) after
verifying a short-lived RS256 token signed by the Fabric control plane (checked
against a configured RSA public key, `fabric({ publicKey })`) — letting a Fabric
operator administer a client app without being one of its real users, and without
any per-environment shared secret. Verification uses WebCrypto so it runs in
Cloudflare Workers. Mirrors `actor()`; use alongside `admin()`.
