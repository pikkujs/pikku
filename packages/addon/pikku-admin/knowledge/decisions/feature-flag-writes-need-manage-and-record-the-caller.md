---
type: decision
title: Feature flag writes need admin:flags:manage and record the caller
description: Every flag write function is gated by admin:flags:manage, and the switch, rollout and override paths pass the caller's userId to the store, while clearing an override does not
tags: admin, flags, scopes
---

# Feature flag writes need admin:flags:manage and record the caller

Six functions change flag state, and each declares the same single scope:
`flag-set-override.function.ts:13`, `flag-set-rollout.function.ts:12`,
`flag-set-enabled.function.ts:12`, `flag-clear-override.function.ts:13`,
`flag-sync.function.ts:9` and `flag-prune.function.ts:9` all carry
`scopes: ['admin:flags:manage']`. The scope's description reads "Switch a feature
flag, set its rollout, and override it for one subject"
(`packages/addon/pikku-admin/src/scopes.ts:62-65`).

Three of them hand the caller's identity to the store:

- `flag-set-enabled.function.ts:17` passes `session?.userId`.
- `flag-set-rollout.function.ts:20` passes `session?.userId`.
- `flag-set-override.function.ts:19` passes `session?.userId`.

`flag-clear-override.function.ts:14-15` takes no session. Its store call receives
only the flag name and the subject, so clearing an override does not carry the
caller's id from this function.

Two other write paths are narrower than their scope suggests:

- `flag-sync.function.ts:11-15` takes the flag names from the running app, not
  from the caller. The comment says a caller-supplied list could create a flag
  nothing declares.
- `flag-set-rollout.function.ts:14-16` rejects a percentage outside 0 to 100
  unless it is `null`.

`flag-prune.function.ts:11` returns whatever `pruneFlags()` returns. The store
interface declares that as `Promise<string[]>`
(`packages/core/src/services/feature-flag-service.ts:126`). The function's
description says it removes undeclared flags and every override on them
(`flag-prune.function.ts:7`).

**What this rules out:** a flag write under the read-only `admin:flags:read` grant,
and a sync whose flag list comes from the request rather than the running app.
