---
type: decision
title: Shorthand permission entries are extracted, so the audit never reads a guarded function as open
description: extractPermissionPikkuNames reads { canAdminOrg } shorthand entries in a permissions record as names, as the runtime does
tags: [inspector, permissions, audit]
---

# Shorthand permission entries are extracted, so the audit never reads a guarded function as open

`extractPermissionPikkuNames` in `packages/inspector/src/utils/permissions.ts` (line 15) reads a
permissions value in two shapes. An array is walked element by element (lines 44-48). An object
literal is walked property by property (lines 49-62).

For a `PropertyAssignment` the initializer is extracted (line 53). For a
`ShorthandPropertyAssignment`, such as `permissions: { canAdminOrg }`, the property name is
extracted (lines 54-60).

The comment at lines 55-59 says the runtime resolves the shorthand the same way as the longhand
form, and that dropping it once reported a guarded function as having no permissions.

**What this rules out:** an audit that skips shorthand permission entries and so shows a guarded
function as open.
