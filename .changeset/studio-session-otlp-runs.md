---
'@pikku/cli': patch
---

The `pikku dev` Studio session now carries `pikku:otlp:runs`, so a signed-in Studio user can read a dev project's live run feed through the Studio project proxy. The session only exists for requests that present the Studio token, so it never reaches a deployed project.
