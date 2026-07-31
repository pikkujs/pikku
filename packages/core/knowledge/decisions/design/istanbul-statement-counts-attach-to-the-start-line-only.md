---
type: decision
title: Istanbul statement counts attach to the start line only
description: The istanbul coverage reader credits a statement's hits to its first line, so an enclosing multi-line statement cannot mask an unexecuted inner one
tags: services
---

# Istanbul statement counts attach to the start line only

`IstanbulCoverageService` (`packages/core/src/services/istanbul-coverage-service.ts`)
reads instrumented counters off the `__coverage__` global and, when turning
statement maps into line hits, credits each statement's count to its *start* line
and no other line it spans.

This is istanbul's own semantics, and the reason matters: statements nest. An
`if` block spanning ten lines has a non-zero count as soon as the `if` is
reached, and a `throw` on line six inside it that never ran has a count of zero.
Spreading the enclosing statement's count across its whole range would paint that
`throw` as covered — the uncovered branch disappears into the covered one, which
is precisely the case coverage exists to surface.

**What this rules out:** filling in `start.line`..`end.line` from a single
statement's count, or merging a nested statement's zero into its parent's total.
Any change here has to keep the innermost statement's own count as the authority
for its line.
