---
type: decision
title: A non-literal global grant is recorded as its source text, not dropped
description: globalSecrets and globalCredentials on a wireAddon keep a computed value as the expression's source text
tags: [inspector, addons, grants]
---

# A non-literal global grant is recorded as its source text, not dropped

In `packages/inspector/src/add/add-wire-addon.ts`, the `globalSecrets` and
`globalCredentials` properties of a `wireAddon` call are read in the same loop as the
other options (lines 216-225). A string literal is stored as its text. Any other
expression is stored as `prop.initializer.getText()` (lines 219-221 and 223-225).

The comment at lines 217-218 gives the reason: "The grant is real at runtime whatever the
reason evaluates to, so a non-literal is recorded as its source text rather than dropped."

**What this rules out:** discarding a global grant because its value is computed. The
inspector does not evaluate the expression, so the recorded text is what a later reader
sees.
