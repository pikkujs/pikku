---
'@pikku/kysely-sqlite': patch
'@pikku/cli': patch
---

`LibsqlWebDialect` now encodes a `Date` bind parameter as an ISO-8601 string and an array or plain record as JSON, instead of throwing `libsql: unsupported argument type object`.

This closes a dev/prod split that broke every write in a deployed libsql app. The CLI's `node:sqlite` dev runtime already coerced dates and objects before binding them, so a query that stamps a `createdAt` or writes a JSON column passed under `pikku dev` — and then threw on the same code path once the app was deployed to a Worker, where this dialect is the one in use. Reads were unaffected, so the symptom was an app whose every insert and update failed while every list and get worked.

Both runtimes also stop accepting objects JSON cannot faithfully represent. A `Map`, a `RegExp` or a class instance stringifies to `"{}"` or to a partial view of itself, so binding one used to persist an empty JSON blob where the caller meant something; it now throws. Only arrays and plain records (including null-prototype ones) are JSON-encoded. The two coercions are deliberately identical — a value that binds under `pikku dev` binds the same way once deployed, which is the property whose absence caused the original bug.

Unsupported values now name their constructor — `unsupported argument type Map` rather than `unsupported argument type object`.
