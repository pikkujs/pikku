---
'@pikku/kysely-sqlite': patch
---

`LibsqlWebDialect` now encodes a `Date` bind parameter as an ISO-8601 string and any other plain object or array as JSON, instead of throwing `libsql: unsupported argument type object`.

This closes a dev/prod split that broke every write in a deployed libsql app. The CLI's `node:sqlite` dev runtime already coerces dates, booleans and objects before binding them, so a query that stamps a `createdAt` or writes a JSON column passes under `pikku dev` — and then throws on the same code path once the app is deployed to a Worker, where this dialect is the one in use. Reads were unaffected, so the symptom was an app whose every insert and update failed while every list and get worked.

Values still decode as they are stored: a date comes back as its ISO string and a JSON column as its JSON string, matching what the dev runtime writes and reads. Types the dialect genuinely cannot represent (a symbol, say) still throw.
