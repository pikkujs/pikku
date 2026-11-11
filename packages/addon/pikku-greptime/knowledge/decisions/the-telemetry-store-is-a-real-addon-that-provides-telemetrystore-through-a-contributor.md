---
type: decision
title: The telemetry store is a real addon that provides TelemetryStore through a contributor
description: an app opts in with wireAddon and contributors greptime; the addon has no functions and shows as installed in Studio; the contributor fails closed
tags: [addon, contributors, telemetry, greptime, fail-closed]
---

# The telemetry store is a real addon that provides TelemetryStore through a contributor

Owner decision, 2026-11-11: the GreptimeDB store is an addon in the Pikku repo
(`@pikku/addon-greptime`), not a bare package, so it is listed as installed in
Studio even when none of its functions is used. It has no functions: a zero-function
addon builds under `pikku all` (verified), and `wireAddon` is what registers it in
`pikkuState(null, 'addons', 'packages')`, which is what Studio lists.

An app opts in with:

```ts
wireAddon({
  name: 'greptime',
  package: '@pikku/addon-greptime',
  contributors: ['greptime'],
})
```

The `greptime` contributor (the same object for `dev` and `deploy`) provides
`telemetryStore`. `run` only builds the store: no network, no SQL.
`onServerStart` pings `/health` and creates the database, so a wrong address stops the
start and not the first request. `onServerStop` closes the store.

## Fail closed

- `PIKKU_GREPTIME_URL` is required. There is no fallback to the in-memory store.
- `PIKKU_GREPTIME_USER` and `PIKKU_GREPTIME_PASSWORD` are both set or both absent.
- A host that is not loopback needs the credentials.
- `PIKKU_GREPTIME_DB` (default `pikku`), `PIKKU_GREPTIME_TTL` (applied only when the
  database is created) and `PIKKU_GREPTIME_TIMEOUT_MS` (default 5000) are optional.
- A store that cannot reach GreptimeDB, or is refused its credentials, throws
  `TelemetryUnavailableError` (reason `unreachable`, `timeout`, `auth` or `server`). It
  never answers an empty list for a failed query. A statement GreptimeDB rejects is a
  `TelemetryQueryError` carrying its code.

## Package shape

Exports: `.` (the addon bootstrap), `./store` (the store and error classes),
`./src/*.js` (the contributor module the host imports, built to `dist/src`) and
`./.pikku/contributors/*` (the contributor metadata). The build copies the generated
JSON next to the compiled output, because the host refuses an addon whose
`dist/.pikku/addon/function/pikku-functions-meta.gen.json` is missing.

## Verified

`verifiers/addon-greptime` starts a real GreptimeDB and a real `pikku dev` on an app
that opts in as above, reads the addon from the installed list, writes and reads a log
through the provided service, and checks the three refusals to start.
