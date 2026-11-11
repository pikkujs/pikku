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

| Variable                                         |                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `PIKKU_GREPTIME_URL`                             | required, the address of GreptimeDB; https unless it is this machine, no credentials inside it    |
| `PIKKU_GREPTIME_USER`, `PIKKU_GREPTIME_PASSWORD` | both or neither; required when the host is not this machine                                       |
| `PIKKU_GREPTIME_DB`                              | database, default `pikku` (created on start); lowercase, up to 63 characters, not a reserved name |
| `PIKKU_GREPTIME_TTL`                             | retention applied when the database is created, e.g. `14d`                                        |
| `PIKKU_GREPTIME_TIMEOUT_MS`                      | per request, a whole number from 1 to 120000, default 5000                                        |

Without `PIKKU_GREPTIME_URL` the app refuses to start; there is no in-memory fallback.

Writes go in as OTLP/HTTP, reads come out as SQL over HTTP. To run the real-database
tests, start a GreptimeDB v1.3.0 (`greptime standalone start`, OTLP on) and run
`GREPTIME_URL=http://127.0.0.1:4000 bun test src`; the header of
`src/greptime-store.conformance.test.ts` has the config.
See `knowledge/` for what the store does about GreptimeDB's behaviour.
