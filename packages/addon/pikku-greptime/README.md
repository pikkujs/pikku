# @pikku/addon-greptime

A GreptimeDB store for Pikku Studio's telemetry. It is an addon with no functions: it
provides the `telemetryStore` service (a `TelemetryStore` from
`@pikku/core/telemetry-store`) through a contributor.

```ts
wireAddon({
  name: 'greptime',
  package: '@pikku/addon-greptime',
  contributors: ['greptime'],
})
```

| Variable                                         |                                                             |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `PIKKU_GREPTIME_URL`                             | required, the HTTP address of GreptimeDB                    |
| `PIKKU_GREPTIME_USER`, `PIKKU_GREPTIME_PASSWORD` | both or neither; required when the host is not this machine |
| `PIKKU_GREPTIME_DB`                              | database, default `pikku` (created on start)                |
| `PIKKU_GREPTIME_TTL`                             | retention applied when the database is created, e.g. `14d`  |
| `PIKKU_GREPTIME_TIMEOUT_MS`                      | per request, default 5000                                   |

Without `PIKKU_GREPTIME_URL` the app refuses to start; there is no in-memory fallback.

Writes go in as OTLP/HTTP, reads come out as SQL over HTTP. To run the real-database
tests, point `GREPTIME_URL` at a GreptimeDB v1.3.0 and run `bun test`.
See `knowledge/` for what the store does about GreptimeDB's behaviour.
