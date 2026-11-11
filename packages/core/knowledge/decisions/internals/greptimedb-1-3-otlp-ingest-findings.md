---
type: decision
title: GreptimeDB 1.3 OTLP ingest findings
description: Verified against a real v1.3.0 standalone - headers per signal, the trace column names, status strings and metric table names the GreptimeDB addon reads
tags: core
---

# GreptimeDB 1.3 OTLP ingest findings

Verified by `verifiers/otlp` against a real `greptime` v1.3.0 (set `GREPTIME_BIN`).

## Headers

- `x-greptime-db-name` must name an existing database (`CREATE DATABASE` first).
- `x-greptime-pipeline-name: greptime_trace_v1` is required on `/v1/otlp/v1/traces`
  (400 "Pipeline is required for this API" without it) and is REJECTED on logs
  (400 "Unsupported pipeline for logs"). Hence the per-signal header env vars.
- `x-greptime-log-pipeline-name: greptime_identity` failed on logs with a
  two-time-index error. Send no pipeline header on logs and metrics.

## Tables (`SHOW CREATE TABLE opentelemetry_traces`)

Fixed columns: `timestamp`, `timestamp_end`, `duration_nano`, `parent_span_id`,
`trace_id`, `span_id`, `span_kind`, `span_name`, `span_status_code`,
`span_status_message`, `trace_state`, `scope_name`, `scope_version`,
`service_name`, `span_events` (JSON), `span_links` (JSON). Append mode, primary
key `service_name`.

Resource attributes are flattened to `"resource_attributes.<key>"` columns:
`"resource_attributes.service.version"`,
`"resource_attributes.deployment.environment.name"`,
`"resource_attributes.pikku.project"`, `"resource_attributes.pikku.stage"`
(`service.name` is the `service_name` column). Span attributes are
`"span_attributes.<key>"`, typed by the first value (`...http.response.status_code`
is BIGINT). Columns appear when first seen.

`span_status_code`: `STATUS_CODE_UNSET`, `STATUS_CODE_OK`, `STATUS_CODE_ERROR`.
`span_kind`: `SPAN_KIND_INTERNAL`, `SPAN_KIND_SERVER`, ... `span_events` holds
`[{name, time, attributes}]`. A type flip returns 400 "failed to coerce trace
column".

## Logs

One table, `opentelemetry_logs`: `timestamp`, `trace_id`, `span_id`,
`severity_text` (our lowercase level), `severity_number`, `body`,
`log_attributes` (JSON), `resource_attributes` (JSON, all keys), scope columns.

## Metrics

One table per metric, `.` becomes `_`, the unit is appended, a monotonic sum gets
`_total`: `process_memory_rss_bytes`, `process_cpu_utilization_ratio`,
`process_heap_used_bytes`, `eventloop_lag_milliseconds`,
`pikku_telemetry_dropped_total`. Columns: `greptime_timestamp` (ms),
`greptime_value`, `job` and `service_name` (both the service name), tags from
data point attributes (`signal`), and resource attributes `service_version` and
`deployment_environment_name`. `pikku.project` and `pikku.stage` are NOT
metric columns: only `deployment.environment.name` carries the stage there.
