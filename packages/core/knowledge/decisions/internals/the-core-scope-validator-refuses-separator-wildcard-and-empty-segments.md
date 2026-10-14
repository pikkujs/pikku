---
type: decision
title: The core scope validator refuses separator, wildcard and empty scope segments
description: assertSegment rejects a scope segment that contains the colon separator, equals the wildcard, or is empty
tags: core, scopes, validation
---

# The core scope validator refuses separator, wildcard and empty scope segments

`assertSegment` in `packages/core/src/wirings/scope/validate-scope-definitions.ts:11-27`
checks each segment of a declared scope name in three ways.

A segment containing the `:` separator throws (`:12-17`). The message says to
nest scopes with the `scopes` property instead. A segment equal to `*` throws
(`:18-23`), because the wildcard is reserved for granting a scope and its
descendants. An empty segment throws (`:24-26`).

The separator and the wildcard constants are at `:8-9`. The walk that calls this
check is described in `scope-roots-may-be-co-declared-by-an-addon-and-its-host-app.md`.

**What this rules out:** a declared scope whose name embeds a separator, which
would make it match a different scope, and a declared wildcard.
