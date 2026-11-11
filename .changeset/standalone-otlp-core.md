---
'@pikku/core': patch
---

The OTLP runtime telemetry exposes `currentTrace()` and `asContextStorage()`, so the runtime can hand the active trace to the database layer.

`OtlpLogger` exports the message only: object fields become log attributes only with `PIKKU_OTLP_LOG_FIELDS=1`, with sensitive field names redacted, and message text and exported strings are scrubbed of URL credentials, bearer tokens and `token=` style pairs. `PIKKU_TELEMETRY` also accepts `false` and `off`, and an endpoint with a query string, fragment or trailing `?` or `#` is refused.
