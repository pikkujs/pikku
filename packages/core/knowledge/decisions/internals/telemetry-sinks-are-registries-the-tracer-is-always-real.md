---
type: decision
title: Telemetry sinks are registries and the tracer is always real
description: otlpSinks is a registry the host creates and analyticsSinks is a provider collection; the endpoint only controls the HTTP sink; in-process sinks are trusted; metrics can still drop
tags: core
---

# Telemetry sinks are registries and the tracer is always real

`pikku dev`, `pikku serve` and the standalone entry create `otlpSinks` before the
app's `createSingletonServices` and re-attach it afterwards. `fanOutOtlp` reads
the list lazily. `analyticsSinks` is a provider collection (`defineProviderCollection`)
that providers add to with `addTo`: the runner builds it once, and
`fanOutAnalytics` reads its label-sorted entries, preparing each item's map once.

- `PIKKU_OTLP_ENDPOINT` only decides whether the HTTP exporter is registered. An
  explicit `PIKKU_TELEMETRY=0` stays inert.
- With an empty registry `Tracer.active` is false: the runner opens no span,
  the context still flows.
- In-process sinks are trusted code, so the loopback rule applies only to the
  HTTP exporter endpoint.
- Sampling is unchanged: an unsampled trace never reaches a sink.
- Analytics fails closed: the map's keys are the events a sink gets.
- Known gap: the exporter's metrics queue drops the oldest past 512, so "metrics
  are never dropped" is false today. Not changed here.
- Cloudflare has no runtime telemetry path; nothing was added there.
