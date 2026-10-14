---
type: decision
title: Scenario artifacts are served by a route-only function, and the run store refuses escaping paths
description: getScenarioArtifact is not RPC-exposed and returns raw bytes over HTTP; it passes the client's path to the run store, and the file store rejects ids and paths that would leave the run
tags: console, scenarios, security
---

# Scenario artifacts are served by a route-only function, and the run store refuses escaping paths

`getScenarioArtifact` (`packages/addon/pikku-console/src/functions/get-scenario-artifact.function.ts`)
returns raw bytes over HTTP, not RPC JSON. The comment says a `<video>` element
needs a URL, and base64 inside an RPC response is "neither playable nor cacheable"
(`get-scenario-artifact.function.ts:4-6`).

It is `expose: false` (`get-scenario-artifact.function.ts:18`), so it is reachable
only through its route. The comment says `path` is "whatever the client asks for,"
and that "the store is what refuses a path that tries to leave the run"
(`get-scenario-artifact.function.ts:8-9`). The function passes `runId` and `path`
to `scenarioRunStore.readArtifact` (`get-scenario-artifact.function.ts:21`) and
returns 404 when nothing is found (`:22-24`). It is gated by
`pikku:console:scenarios:read` (`get-scenario-artifact.function.ts:19`).

The refusal is in the file-backed store that this repository implements. Its
`readArtifact` returns `undefined` when the run id fails `SAFE_RUN_ID`
(`packages/core/src/services/file-scenario-run-store.ts:21`) or the path fails
`SAFE_ARTIFACT_PATH` (`file-scenario-run-store.ts:72-73`, checked at `:187-189`).
Other store implementations were not read, so this note covers the file store only.

**What this rules out:** exposing artifact bytes through RPC, and a path check in
the function that would duplicate the store's.
