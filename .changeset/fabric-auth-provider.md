---
'@pikku/better-auth': patch
---

Add the `fabric()` auth plugin: `POST /sign-in/fabric` mints an app-admin session
for a synthetic, `fabric: true` operator row (created with `role: 'admin'`) after
checking a per-environment shared secret — letting a Fabric operator administer a
client app without being one of its real users. Mirrors `actor()`; use alongside
`admin()`.
