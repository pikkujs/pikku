---
'@pikku/console': patch
---

Fix cross-origin cookie auth in the console: `pikku()` now forwards the `credentials` option to `PikkuFetch`, so RPCs (e.g. `console:getAllMeta`) send the session cookie when the console is served on a different origin than the API (`pikku serve --console <port>`). Previously the option was accepted but dropped, causing a 403 and "Failed to load metadata" after sign-in.
