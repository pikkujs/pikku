---
type: decision
title: Scope segments may not be wildcards or contain colons
description: The inspector refuses an empty scope segment, a segment containing the separator, and a literal wildcard segment
tags: [inspector, scopes]
---

# Scope segments may not be wildcards or contain colons

`isValidSegment` in `packages/inspector/src/add/add-scope.ts` checks one segment at a
time and reports each failure as critical:

- an empty segment is refused (lines 21-27);
- a segment containing `:` is refused, with the message telling the author to nest
  with the `scopes` property instead (lines 28-35);
- a segment equal to `*` is refused, because `*` is reserved for granting a scope
  and its descendants (lines 36-43).

`declareScopes` ids are split on `:` and every segment is checked (line 161). Nested
`scopes` keys are checked the same way (line 77).

**What this rules out:** a declared scope that is itself a wildcard, and a scope
name that hides a second level of nesting inside one segment.
