---
type: overview
title: Decisions
description: The GreptimeDB telemetry store addon, its contributor and the GreptimeDB v1.3.0 behaviour it is built around
---

# Decisions

<!-- pikku:knowledge-index -->

- [The telemetry store is a real addon that provides TelemetryStore through a contributor](the-telemetry-store-is-a-real-addon-that-provides-telemetrystore-through-a-contributor.md) — an app opts in with wireAddon and contributors greptime; the addon has no functions and shows as installed in Studio; the contributor fails closed
- [Reads are SQL over HTTP, writes are OTLP protobuf, and the schema is read, not assumed](reads-are-sql-over-http-writes-are-otlp-protobuf-and-the-schema-is-read-not-assumed.md) — the findings about GreptimeDB v1.3.0 that decide the table mapping, the tail cursor, retention and project deletion

<!-- /pikku:knowledge-index -->
