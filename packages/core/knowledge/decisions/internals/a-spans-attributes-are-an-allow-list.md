---
type: decision
title: A span's attributes are an allow-list
description: Core sets a fixed set of framework facts on a span and nothing else, so no input, header, query or stack can reach a telemetry store
tags: core
---

# A span's attributes are an allow-list

The function runner (`function/function-span.ts`) sets span attributes by name
from a fixed table: wire type and id, function id, package, addon namespace,
whether the trace is a root, `pikku.function.duration_ms`, `pikku.user.id`,
`pikku.org.id`, `pikku.impersonated` and `pikku.impersonated.by` (set only when the session carries `impersonated`), the HTTP method, route and status, queue name and job id,
scheduler task, workflow name, run id and step, channel id, MCP tool. Boundary
spans (a queue publish, a scheduled RPC, a webhook send, a remote RPC) add
`messaging.system`, `messaging.destination.name` (a queue name, an RPC name or a
webhook event name, never a payload or URL) and `rpc.service` (the addon
namespace of a remote call). An outbound HTTP client span (an addon's scoped
`http` service) adds `server.address` (the hostname alone, never a URL),
`server.port`, `pikku.network.rule` (the allow-list pattern that matched) and
`pikku.network.blocked`. `url.full`, `url.path`, `url.query` and request headers
are deliberately not listed: a path or query string carries ids and tokens, so
the exporter drops them even when an implementation sets them. Every value is an
id or a number the framework already holds. `otlp/attribute-types.ts` fixes each key's column type.

The exporter enforces the list too: `AttributeTypes.coerce` drops any key that is
neither listed nor under a plugin prefix (`db.`, the Kysely plugin's open-ended
family), and counts it in `pikku.telemetry.dropped` with `signal=span_attributes`.
Span events are held to the same rule: an event may carry only `exception.type`
and `exception.message`, and its name must be a short lowercase dotted
identifier; anything else is dropped and counted in the same counter. A key a user plugin invents on its own span is therefore dropped unless core adds
its prefix by name; there is no opt-in for user prefixes.

Nothing is derived from function input, query parameters, headers, cookies or the
session beyond the two ids. An error leaves only as `Name: message`, cut to 256
characters, plus `exception.type`/`exception.message`: never `exception.stacktrace`,
because stacks carry file paths and, for some errors, interpolated input.
Boundary spans (a publish, a remote call) keep only `exception.type`, since the
error comes from a backend that can carry a connection URL.
`redactSpanError` in `tracer.ts` is the only place an error becomes span text,
and `Span.end` applies it, so a caller cannot hand a raw error to a sink.

`SPAN_LIMITS` (64 attributes, 128-char keys, 1024-char strings, 32 events) are
enforced by the `Span` implementation through `setBoundedAttribute`, not by the
exporter, so an oversized value never reaches a queue.

**What this rules out:** an "include the request body" or "include headers" option,
a catch-all `attributes` bag on the runner, and putting the stack on the span for
debugging. A new attribute is added by name in core, with a reviewer reading it.
