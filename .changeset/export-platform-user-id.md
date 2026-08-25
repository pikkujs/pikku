---
'@pikku/better-auth': patch
---

Export `PLATFORM_USER_ID` from the package root.

It is the identity a host app runs platform-initiated work as — a scheduled task
signing itself in, for one — but the package only exported the plugin that owns
it, and there are no subpath exports, so no consumer could name it without
copying the literal.
