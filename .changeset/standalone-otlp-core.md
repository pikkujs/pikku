---
'@pikku/core': patch
---

The OTLP runtime telemetry exposes `currentTrace()` and `asContextStorage()`, so the runtime can hand the active trace to the database layer.

`OtlpLogger` redacts log attributes whose field name looks sensitive (token, secret, password, authorization, cookie, key, credential, session, bearer). `PIKKU_TELEMETRY` also accepts `false` and `off`, and an endpoint with a query string or fragment is refused.
