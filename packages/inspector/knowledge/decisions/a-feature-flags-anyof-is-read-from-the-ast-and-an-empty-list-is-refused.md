---
type: decision
title: A feature flag's anyOf is read from the AST, and an empty anyOf is refused
description: add-feature-flag reads the scope names in anyOf statically, refuses a non-array or empty anyOf, and refuses a flag name containing the scope separator
tags: [inspector, feature-flags, scopes]
---

# A feature flag's anyOf is read from the AST, and an empty anyOf is refused

`extractAnyOf` in `packages/inspector/src/add/add-feature-flag.ts` (lines 96-137) reads the
`anyOf` property. If the property is absent it returns `undefined` (lines 108-110). If it is
present but not an array literal, it reports a critical error (lines 112-121). Each element must be
a string literal (lines 124-133). A non-literal element is reported and skipped.

In `addFeatureFlag`, a flag name containing the scope separator is refused (lines 193-199). A body
that is not an object literal, or a variable holding one, is refused (lines 204-211). An `anyOf` that
is an empty array is refused (lines 215-221), and the message says to omit `anyOf` for a pure switch.

**What this rules out:** a flag whose capability list cannot be read from the source, a flag named
like a scope, and `anyOf: []`. An omitted `anyOf` is not refused; it is recorded as `undefined` (line 230).
