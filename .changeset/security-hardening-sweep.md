---
'@pikku/core': patch
'@pikku/better-auth': patch
'@pikku/express': patch
'@pikku/node-http-server': patch
---

Security hardening sweep

- **Content uploads require a signature**, matching reads. `handleUpload` previously validated the path and the size limit and then wrote the file, so an unauthenticated `PUT` to the upload prefix landed on disk. The express server, which verified nothing at all, now verifies both uploads and reads.
- **The remote-RPC prefix is matched case-insensitively.** The router matches routes case-insensitively, so `/Remote/RPC/fn` reached the same handler while a case-sensitive `startsWith('/remote/rpc/')` let it past the mesh trust gate and the token's `fn` binding.
- **Dev quick-login refuses proxied requests.** The gate checked the hostname only, so a request forwarded with `Host: localhost` was auto-provisioned a root-admin session. Proxy markers (`forwarded`, `x-forwarded-*`) now refuse regardless of what they claim, and dev login is inert in production.
- **Logout clears the session cookie** instead of re-signing an absent session into a fresh, unexpired one.
- **Short-flag cluster parsing is bounded**, closing a CLI-over-channel denial of service.
- `allowedHosts` is carried into secret definition meta.
