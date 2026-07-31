---
type: decision
title: In a scenario a 4xx is data, not an exception
description: postScenarioJson and invokeRaw report the status instead of throwing, because a refusal is the expected outcome of a permissions scenario
tags: services
---

# In a scenario a 4xx is data, not an exception

`postScenarioJson` (`packages/core/src/services/scenario-actors-service.ts`) and
`ScenarioActor.invokeRaw` return a `ScenarioHttpResponse` for every status. Only
`invoke` throws, and it throws with a truncated body — which is why a scenario
asserting on a refusal must use `invokeRaw`.

A permissions or scopes scenario *expects* the 403. The status is the assertion,
and the body usually names the scope that was missing, so both have to survive as
data rather than being reduced to a thrown `Error`. These helpers also exist
because every scenario reaching past an actor was hand-writing the same
`content-type`, `JSON.stringify` and drain — and the copies had drifted: several
returned `res.json()`, which discards the status entirely and throws outright on
an empty body or an HTML error page.

**What this rules out:** adding a `throwOnError` default to these helpers,
routing scenario assertions through `invoke`, and reintroducing per-scenario
fetch wrappers that return a parsed body without the status.
