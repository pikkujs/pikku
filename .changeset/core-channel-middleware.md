---
'@pikku/core': minor
---

Refactor channel middleware handling and add lifecycle middleware support

**Breaking Changes:**
- Improved middleware resolution for channel message handlers to properly combine channel-level and message-level middleware
- Fixed cache key collisions when multiple message handlers use the same function

**New Features:**
- Add `runChannelLifecycleWithMiddleware` helper in `channel-common.ts` for consistent lifecycle function execution
- Support middleware on `onConnect` and `onDisconnect` lifecycle functions
- Channel-level middleware now properly applies to all messages in the channel

**Bug Fixes:**
- Fix middleware ordering: channel middleware → message middleware → inherited middleware
- Fix cache key generation to include routing information (prevents cache collisions)
- Properly detect wrapper objects vs direct function configs for message handlers
