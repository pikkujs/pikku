---
type: decision
title: Reads are SQL over HTTP, writes are OTLP protobuf, and the schema is read, not assumed
description: the findings about GreptimeDB v1.3.0 that decide the table mapping, the tail cursor, retention and project deletion
tags: [greptime, otlp, sql, retention, tail]
---

# Reads are SQL over HTTP, writes are OTLP protobuf, and the schema is read, not assumed

Found against a real GreptimeDB v1.3.0 and proved by core's conformance suite (34 of 34) plus `greptime-retention.test.ts`. The suites skip without `GREPTIME_URL`; a mock
would prove nothing.

## Writes

OTLP is protobuf only (JSON is a 400). The database named in `x-greptime-db-name` must
exist, so the store creates it. Traces need `x-greptime-pipeline-name:
greptime_trace_v1`; logs and metrics are rejected with it. `otlp-encode.ts` is a small
private encoder for exactly the fields set.

- Logs keep `functionId`, `wireType`, `wireId` and `source` as `pikku.*` attributes, read
  back out of `attributes`. A row with no source is `app`. `critical` reads back as
  `fatal`, `warning` as `warn`, anything else as `info`.
- A span attribute column takes the type of the first value it sees, and another type is
  an HTTP 400 for the whole batch. The store remembers each key's type (seeded from the
  table's columns) and coerces later values; the four well-known keys are always strings.
- `endAt` is not stored; a span is written as start plus `durationMs`, so the two always
  agree and the stored duration is the record's.
- Every metric is a gauge with no unit. Each point carries `pikku.project`,
  `pikku.stage` and `pikku.metric.name` as data point attributes (they become tag columns;
  resource attributes do not), and user attributes as strings.

## Reads

The table and column names are read from `information_schema` (cached 2s, dropped on
every write), because trace attribute columns appear only when first seen and tables do
not exist before the first write. A missing table answers empty; a missing column is
`NULL`. If the engine reports one missing the cache is dropped and the statement
rebuilt once.

- Root spans have `parent_span_id` NULL, not `''`; both count as root.
- JSON attributes of logs are read with `json_get_string(col, '$["a.b"]')`; the
  plain `'a.b'` path returns NULL. Trace attributes are flat columns `"span_attributes.a.b"`.
- Nanosecond timestamps are selected as text (JSON numbers lose precision above 2^53).
- Search is `strpos(lower(body), lower(term)) > 0`. The plan suggested `matches_term`;
  it is case-sensitive, so it is not used. `%`, `_` and `'` are literal.
- Buckets are integer arithmetic on the start time, aligned to `since`, not `date_bin`.
- The tail cursor is `ns:<timestamp ns>:<rows already returned at that instant>`. Rows
  sharing a timestamp are ordered by content (body, ids, severity) and the next page
  resumes by offset into the group, so each is returned once. Two rows identical in every
  column are both counted.
- Metric names map to tables: dots become underscores, a table may have a unit suffix
  (`pikku_process_memory_rss_bytes`), and `x.*` matches by table prefix. Tag columns lose
  their dots (`http_x`), which is a limit of the exporter's own tables.

## Retention

`retain({days})` sets `ttl` on `opentelemetry_logs`, `opentelemetry_traces` and
`greptime_physical_table` (the metrics' logical tables reject `ALTER ... SET ttl`:
"only support add columns"), then flushes and compacts them. GreptimeDB drops expired
rows at flush and compaction, so a TTL alone is not retention. `compact()` is the same
without the TTL. The job wiring and the disk-cap rule of plan 4.5 live in
`retention.ts`.

## Deleting a project

`DELETE` is refused on the OTLP tables: "DELETE is not allowed under append mode".
`deleteProject` writes a row to `pikku_project_tombstones` (primary key project, time
index `deleted_at`) and every read of that project is limited to rows later than it.
The rows leave the disk when retention drops them. A project re-created later is visible
again from the moment it is written, but records it writes with timestamps before the
deletion are hidden.

## Unverified

The conformance suite checks one process. Concurrent writers to one database, and a
GreptimeDB cluster (not standalone), are not exercised.
