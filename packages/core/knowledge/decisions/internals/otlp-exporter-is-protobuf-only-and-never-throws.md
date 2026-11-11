---
type: decision
title: The OTLP exporter is protobuf-only and never throws
description: Telemetry export is best-effort, bounded in memory, loopback by default, and cannot fail or slow the app that produces it
tags: core
---

# The OTLP exporter is protobuf-only and never throws

`@pikku/core/otlp` encodes OTLP/HTTP by hand (`otlp/protobuf-writer.ts`,
`otlp-encode.ts`), so core takes no OpenTelemetry SDK and no dependency. There is
no JSON mode: one wire format, one set of bugs. The encoder is checked byte for
byte against an independent encoder, and `@pikku/core/testing` has a reader
(`decodeTraces`, `decodeLogs`, `decodeMetrics`) for tests.

- Export never throws into the caller. A failed batch is retried once after 1s
  (not on a 4xx other than 408 and 429), ten failed batches in a row back off
  for 30s, and a warning is logged at most once a minute per signal.
- The queues are capped (2048 spans, 4096 logs, 512 metrics). Overflow drops the
  oldest and is exported as the cumulative sum `pikku.telemetry.dropped{signal}`.
- GreptimeDB turns span attributes into typed columns, so a value whose type
  differs from the first one seen for that key is rejected with a 400. The
  exporter coerces to the first-seen type and drops a value it cannot coerce
  rather than invent data (`attribute-types.ts`).
- `createRuntimeTelemetry` refuses a non-loopback endpoint unless
  `PIKKU_OTLP_ALLOW_REMOTE=1`, and a malformed `PIKKU_OTLP_HEADERS` throws at
  start.
- Headers can differ per signal (`PIKKU_OTLP_TRACES_HEADERS`,
  `_LOGS_HEADERS`, `_METRICS_HEADERS`), because GreptimeDB wants its pipeline
  header on traces only.
- Nothing here uses `AsyncLocalStorage`: `contextStorage` is an optional injected
  interface, so the subpath stays edge-clean.

## PIKKU_OTLP_* environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PIKKU_OTLP_ENDPOINT` | unset (off) | OTLP/HTTP base URL. Unset means no exporter, no timer, no connection. |
| `PIKKU_TELEMETRY` | unset | `0`, `false` or `off` (trimmed, any case) turns telemetry off even when an endpoint is set. |
| `PIKKU_OTLP_ALLOW_REMOTE` | unset | `1` allows a non-loopback host. The endpoint must then be `https`. |
| `PIKKU_OTLP_HEADERS` | none | `k=v,k2=v2`, sent with every signal. |
| `PIKKU_OTLP_TRACES_HEADERS`, `PIKKU_OTLP_LOGS_HEADERS`, `PIKKU_OTLP_METRICS_HEADERS` | none | Added to one signal only. |
| `PIKKU_OTLP_LOG_LEVEL` | `info` | Lowest level forwarded as an OTLP log. An unknown name logs a warning and uses `info`. |
| `PIKKU_OTLP_LOG_FIELDS` | unset | `1` also exports an object's fields as log attributes (sensitive names redacted). Off by default: only the message text leaves. |
| `PIKKU_OTLP_SQL_TEXT` | unset | `1` records the (parameterless) SQL text on `db.*` spans. Off by default. |
| `PIKKU_OTLP_SERVICE_NAME` | `PIKKU_PROJECT`, else the unit or project name | `service.name`. |
| `PIKKU_STAGE`, `PIKKU_PROJECT` | none | Resource attributes when set. |

Fails closed, at boot (exit 1), never by silently dropping telemetry: a non-loopback host without `PIKKU_OTLP_ALLOW_REMOTE=1`; a non-loopback `http` endpoint; credentials in the URL; a query string, fragment or trailing `?` or `#` in the URL (send credentials in a headers variable); a malformed headers value; a non-http(s) or unparsable URL. Error messages never echo the URL, only the host of a refused remote endpoint.

### Logs export the message only; fields are opt-in and redacted

`OtlpLogger` forwards the scrubbed message text, the level and the trace and
span ids. An object's fields are not exported unless `PIKKU_OTLP_LOG_FIELDS=1`
(security-first: nothing leaves by default). With it on, any field whose name
contains (case-insensitive) `token`, `secret`, `password`, `passwd`, `pwd`,
`pass`, `auth`, `cookie`, `key`, `credential`, `session`, `bearer`, `jwt`,
`otp`, `pin`, `ssn`, `sig`, `salt`, `dsn`, `csrf`, `xsrf`, `sid`, `cvv`, `card`,
`oauth`, `url`, `headers`, `connection` or `database_url` has its value replaced
by `[redacted]`, at any depth (cut at 4 levels). Plain-string array elements and
numeric keys are never exported, and `exception.type` is exported only with
fields on. The name match is a substring, so it over-redacts (`pinned`,
`sidebar`) on purpose.

Message text and every exported string go through a best-effort scrub:
`scheme://user:pw@` userinfo, `Bearer <x>`, `Authorization: ...` and
`token|key|secret|password|passwd|pwd|sig|signature|code=<value>` pairs,
`password|passwd|pwd: <value>`, and `Cookie`/`Set-Cookie` header values become
`[redacted]`. Input is clipped to 8 KB before scrubbing and every pattern is
anchored on a literal (the URL scheme is bounded to 32 characters behind a
lookbehind), so cost is linear: all patterns together measure under 20 ms on
1 MB of hostile text, and a regression test holds the bound. Limits: the scrub is pattern based and cannot recognise a secret
with no marker (a bare API key or password in prose). Known gaps: a raw JWT, provider keys
(`AKIA...`, `ghp_...`), PEM blocks, url-encoded separators (`%3D`), and userinfo
whose password contains `/`. A secret in the message text can still leave; do
not log one. A `SecretValue` serializes to `[secret]`.
