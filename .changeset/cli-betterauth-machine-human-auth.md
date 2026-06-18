---
'@pikku/cli': patch
'@pikku/better-auth': patch
---

feat(cli,better-auth): unified machine + human auth (pikku login + api-key)

A single better-auth-backed model for authenticating CLIs and machines.

- **Human**: `pikku login` / `logout` / `whoami` run a device-authorization flow
  and persist a session at `~/.pikku/session.json` (0600, keyed by base URL, with
  expiry).
- **Machine**: `betterAuthSession()` gains a stateless api-key branch — it resolves
  scope via `verifyApiKey` (not `getSession`, which drops metadata) and is
  authoritative when the `x-api-key` header is present.
- **Auto-wire**: generated channel CLI clients attach the credential on the WS
  upgrade handshake (`PIKKU_API_KEY` → `x-api-key`, else the stored token →
  `Bearer`), so `betterAuthSession` resolves before the channel opens.

`@better-auth/api-key` is a separate official package (not in the better-auth
plugins barrel); peer-requires `better-auth ^1.6.19`.
