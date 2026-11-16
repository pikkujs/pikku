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

**Tie order is by code unit.** Where the contract says "ties ascending" (function
id, wire type, queue name), strings compare by UTF-16 code unit, so `B` sorts
before `a`. A SQL store that compares by UTF-8 bytes (Greptime, OpenObserve)
agrees with that for every pair except one case: an astral character (U+10000
and above, a surrogate pair in UTF-16) against a character in U+E000..U+FFFF.
UTF-16 puts the astral one first, UTF-8 puts it last. The conformance suite does
not exercise that pair; a store should not rely on the order of those two
ranges, and the contract does not promise it.
