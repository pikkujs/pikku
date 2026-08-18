---
'@pikku/core': patch
---

A `ref()`-wired addon route now reads the function's schemas, services and permissions from the addon's package rather than the consuming app's.

Resolving a namespaced target by namespace re-pointed the function's config and metadata into the addon's package state but left every other package-scoped lookup on the wire's package. The addon registers `SignDataInput` under its own package, so the runner looked it up under `main`, and the route answered 500 for every input it was given — along with the addon's package singleton services, which is what left its credentials unreachable.

The wiring itself is still the consuming app's, so middleware, addon tags, addon auth and addon scopes keep resolving against the app: those read the declarations the app made about the addon, and moving them would put back the unrun credential and session middleware that resolving by namespace was introduced to fix.
