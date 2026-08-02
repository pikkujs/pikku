---
type: decision
title: Scenario steps return drained response records
description: A scenario step hands back ScenarioHttpResponse rather than a Response, because the body stream reads once and the return value crosses into the run record
tags: services
---

# Scenario steps return drained response records

`ScenarioHttpResponse` and `readScenarioHttpResponse`
(`packages/core/src/services/scenario-actors-service.ts`) exist because a `fetch`
`Response` cannot be a scenario step's return value. A step's result is
serialised into the workflow run record, and a `Response` body is a stream that
reads exactly once — by the time anything downstream looks at it, it is either
consumed or unreadable.

So the response is drained at the boundary: status, `ok`, the parsed body, and
the raw text it was parsed from. `serialized` is kept alongside `body` so an
assertion can search the payload without knowing its shape, and so an error page
that is HTML rather than JSON still says what went wrong instead of collapsing to
a parse failure. `body` is `undefined` for an empty response and the raw text when
the payload was not JSON; its type parameter is a claim the caller makes, not one
the transport checked.

**What this rules out:** returning `Response` (or anything holding a stream) from
a scenario step or an actor method, and dropping `serialized` as redundant with
`body` — a non-JSON error body has no other route to the assertion.
