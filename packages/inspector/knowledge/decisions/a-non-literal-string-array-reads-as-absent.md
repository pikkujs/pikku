---
type: decision
title: A string array with one computed entry reads as absent, not as its literal entries
description: stringArrayProperty returns undefined unless every element of the array is a string literal
tags: [inspector, literals, virtual-users]
---

# A string array with one computed entry reads as absent, not as its literal entries

`stringArrayProperty` in `packages/inspector/src/utils/literal-properties.ts` returns
`undefined` when the property is missing or is not an array literal (lines 84-86). It keeps
the string-literal entries (lines 87-89) and returns them only when every element was kept
(line 90). One computed entry therefore makes the whole result `undefined`.

The comment at lines 74-77 says a half-read array "typechecks, runs, and grants less than
the source says", which is why the helper is all-or-nothing.

Callers in this package include `add-virtual-users.ts` for `roles`, `goals` and `tags`, which
fall back to `[]` when the helper returns `undefined` (lines 248-250), and for `fixtures`
and `environments` (lines 274 and 279). `add-feature.ts` keeps a local copy of the helper with the same all-or-nothing rule
and reads `tags` through it (line 256).
A search of the package found no caller that reads `scopes` through this helper.

**What this rules out:** a virtual user or feature keeping the literal entries of a roles or tags
array that also holds a computed value. Such a virtual user gets an empty list instead.
