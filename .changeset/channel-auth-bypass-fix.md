---
'@pikku/core': patch
---

Fix critical security vulnerability in channel message handler: `validateAuth` was being called with `channelHandler` (always truthy) instead of the actual user session, meaning auth checks always passed and unauthenticated clients could send messages to protected channels. Also fix an information disclosure issue where the full channel config object was being logged on unhandled messages.
