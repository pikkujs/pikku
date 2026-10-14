---
type: decision
title: A permission whose data parameter starts with an underscore takes no data
description: An underscore-prefixed data parameter marks a permission as auth-only, and pikkuAuth always has no data
tags: [inspector, permissions]
---

# A permission whose data parameter starts with an underscore takes no data

In `packages/inspector/src/add/add-permission.ts`, `requiresData` is false when the
second parameter's name starts with `_` (lines 107-110). The permission entry then
gets `requiresData: false` (line 120). The debug log labels such an entry
"auth-only" (line 124).

`pikkuAuth` always sets `requiresData: false` (line 204) and an empty, optimized wires
list (line 171). Its handler's second parameter is the resolved session, not a wires
bag (comment at lines 167-170).

**What this rules out:** a permission whose data parameter is underscore-prefixed
being treated as needing request data.
