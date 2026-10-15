---
type: decision
title: An unknown predefined n8n credential gets a stub, not a bearer guess
description: A predefined n8n credential type missing from the table produces no auth recipe, so the node stays a throwing stub
tags: [n8n, auth, import]
---

# An unknown predefined n8n credential gets a stub, not a bearer guess

`UNKNOWN_PREDEFINED_FALLBACK` in `packages/n8n-import/src/http-auth-map.ts` is typed
`'stub' | 'bearer'` and set to `'stub'` (line 32). Its comment says `'stub'` leaves
the node a throwing stub with no auth guess, and that `'stub'` is the default
(lines 27-31).

In `predefinedRecipe` (lines 113-123), a credential type not in the `PREDEFINED`
table returns `undefined` under the current setting (lines 117-122). The `'bearer'` branch, which would emit `Authorization: Bearer` with a TODO,
is still in the code but is not reached.

`httpAuthRecipe` documents the result (lines 129-134). An `undefined` recipe leaves
the caller a throwing integration stub. The test at
`packages/n8n-import/src/http-auth-map.test.ts:233` is named
"unknown predefined credential type → undefined (default fallback is stub)".

**What this rules out:** a guessed `Authorization: Bearer` header for a credential
type the import does not recognise, unless the constant is changed.
