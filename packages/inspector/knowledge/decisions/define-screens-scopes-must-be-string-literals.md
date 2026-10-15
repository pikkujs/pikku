---
type: decision
title: A define-screens scopes list must be string literals, or the build reports a critical error
description: add-define-screens reads each screen's scopes by AST and reports ADDON_SCREENS_NOT_STATIC when the value is not an array of string literals
tags: [inspector, screens, scopes]
---

# A define-screens scopes list must be string literals, or the build reports a critical error

In `packages/inspector/src/add/add-define-screens.ts`, each screen's `scopes` value is read with
`stringArray(value)` (line 110). If that returns nothing, `fail(...)` runs (lines 111-115), with the
message "A screen's scopes must be an array of string literals".

`fail` is defined at lines 60-61 as `logger.critical(ErrorCode.ADDON_SCREENS_NOT_STATIC, message)`.
The same block requires `component` to be a literal lazy import (lines 116-120).

**What this rules out:** a screen whose scopes come from a variable, a computed value or a call.
The inspector reads scopes statically, so it cannot check a value it cannot see.
