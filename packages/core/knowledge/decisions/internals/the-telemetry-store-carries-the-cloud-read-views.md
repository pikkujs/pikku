---
type: decision
title: The telemetry store carries the cloud's read views, and logs take their duration from the root span
description: functionMetrics, wireTypes and wireRuns are required on TelemetryStore; a tenant filter keys on pikku.org.id and pikku.user.id; a log line's duration is the root span of its trace, joined by the store
tags: core
---

# The telemetry store carries the cloud's read views

The cloud console read observability through a second, OpenObserve-shaped query
surface. That surface is gone: every screen reads through `TelemetryStore`, so
Memory, GreptimeDB and the cloud store answer the same questions and one
conformance suite proves all of them.

**Required, not optional.** `functionMetrics`, `wireTypes` and `wireRuns` are
required members. The only implementers are the in-memory store, the GreptimeDB
addon and the cloud store, and they change together; an optional method would
leave a screen that has to render "not supported", which is the second contract
this change removes.

**Tenant filter.** `TenantFilter { org, user }` matches the span or log
attributes `pikku.org.id` and `pikku.user.id`. A store with no value for a named
key returns nothing; an unfiltered answer to a filtered question is a leak.
`trace` returns a trace only when one of its spans carries every named key and
none carries a different value.

**Duration comes from the root span.** The function runner owns the span, which
has a start and an end, so there is no `pikku.duration.ms` attribute to keep in
step with it. A log line with a `traceId` gets `durationMs` from the root span of
that trace, joined on read by each store; no root span, no field.

**Workspace is not a scope.** A sandbox workspace is `{ project, stage:
sandboxId }`; adapters map it, the contract does not grow a third key.

**What stays out.** Reads across stages or projects (an org's traffic table, an
org-wide issue list), billing counts and sandbox host metrics are not
observability of one scope. They stay in the cloud's own store.
