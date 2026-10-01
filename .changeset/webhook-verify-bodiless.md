---
'@pikku/core': patch
---

A webhook source's `verify` now also checks requests without a body. A bodiless request that is signed can dispatch events, such as Google Calendar and Drive notifications, which carry only headers. One that is not signed can still be answered, as before, so handshakes keep working.
