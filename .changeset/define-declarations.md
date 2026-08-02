---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/skills': patch
'@pikku/console': patch
'@pikku/addon-console': patch
'@pikku/better-auth': patch
'@pikku/openapi-parser': patch
---

rename the inspected declarations to `define*`: `wireScope` → `defineScope`, `wireSecret` → `defineSecret`, `wireVariable` → `defineVariable`, `wireCredential` → `defineCredential`

`wire*` meant two unrelated things. A transport wiring attaches a function to
something that can invoke it — `wireHTTP`, `wireChannel`, `wireScheduler`,
`wireQueueWorker` and the rest — and the thing it wires runs. These four wire
nothing: they are no-ops that exist only so the call typechecks, they are
tree-shaken out of the build, and their whole job is to be found by the
inspector's AST pass and turned into a type union. One word for both left the
declaration reading like a registration with a runtime.

So the vocabulary splits: **`wire*` is a transport, `define*` is an inspected
declaration.**

```ts
import { defineScope } from '@pikku/core/scope'
import { defineSecret } from '@pikku/core/secret'
import { defineVariable } from '@pikku/core/variable'
import { defineCredential } from '@pikku/core/credential'

defineScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })
```

**Breaking:** no alias is kept. Rename the four call sites; the module subpaths
(`@pikku/core/scope`, `/secret`, `/variable`) are unchanged.

The inspector matches these by identifier text, so a stale `wire*` call is not a
type error — it is silently not extracted, and the generated union comes back
empty. That fails as "this scope isn't declared" on code that was fine a moment
ago, nowhere near the declaration. Grep for the old names rather than trusting a
clean build.

An addon published with `.pikku` output generated before this release re-exports
`wireSecret` from `@pikku/core/secret` and will not typecheck against this core
until it is rebuilt and republished.
