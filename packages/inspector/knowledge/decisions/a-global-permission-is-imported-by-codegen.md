---
type: decision
title: A global permission is recorded so codegen imports the file that registers it
description: addGlobalPermission calls are recorded in permissions.global and the generated permissions file imports each one, because a global permission registers at module evaluation and nothing else is guaranteed to load its file
tags: [inspector, permissions, codegen, security]
---

# A global permission is recorded so codegen imports the file that registers it

`addGlobalPermission([...])` registers when its module is evaluated. The
inspector did not look at it at all, and `serializePermissionsImports` emitted
nothing on the grounds that permissions are function-scoped. So a file whose
only job was a global permission was never imported by the generated bootstrap,
and every function ran without that gate. It held only when some function
happened to import the same file for another export.

`addPermission` now records each call in `state.permissions.global`: its file,
the exported zero-argument factory it sits in if any, and the ids of the
permissions it registers. The generated `pikku-permissions.gen.ts` imports each
file for its side effect, or imports and calls the factory, and is generated
whenever a global registration exists even if no other permission does. A
permission written inline in the array is given an id from its position, so it
is no longer refused as unassigned, and the services of every global permission
— and of global middleware — count as required.

**What this rules out:** relying on a function's imports to load a global
permission; and treating permissions as function-scoped only.
