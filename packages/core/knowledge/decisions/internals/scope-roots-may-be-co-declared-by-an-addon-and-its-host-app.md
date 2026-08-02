---
type: decision
title: Scope roots may be co-declared by an addon and its host app
description: flattenScopeDefinitions dedupes ids because the same root can legitimately be declared twice, and every consumer requires one entry per scope
tags: services
---

# Scope roots may be co-declared by an addon and its host app

`flattenScopeDefinitions`
(`packages/core/src/wirings/scope/validate-scope-definitions.ts`) walks the
declared trees depth-first, emits every node including intermediate ones, and
then filters the result through a `seen` set. The dedupe is not defensive
programming.

An addon and the app hosting it may both contribute the same root — both
declaring an `admin` tree, say — and that is a supported arrangement, not a
misconfiguration. `validateAndBuildScopeDefinitionsMeta` has already established
that definitions sharing a name are identical, and errors naming both source
files if they are not, so by the time flattening runs a repeat is redundant rather
than conflicting. Collapsing it here is what keeps the consumers honest: codegen
writes these ids into an object literal keyed by id, where a duplicate key is a
TypeScript error, and a `ScopeService` syncs one row per scope instead of
re-writing the same one. `packages/core/src/wirings/scope/scope.test.ts` covers
the co-declaration case.

**What this rules out:** dropping the `seen` filter on the grounds that ids are
already unique per declaration, and turning a repeated root into a validation
error. The uniqueness guarantee lives here, and both codegen and scope sync
depend on it.
