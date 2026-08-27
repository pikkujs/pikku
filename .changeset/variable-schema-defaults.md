---
'@pikku/core': minor
'@pikku/cli': minor
---

Resolve a variable's declared default instead of dropping it.

`defineVariable` takes a schema, and a schema can carry a default — `z.enum(['https://api.github.com']).default('https://api.github.com')` is the shape most addons declare their base URL with. Nothing read it. `variables.get('GITHUB_BASE_URL')` returned `undefined` on a host that had not set it, and the `as string` at the call site hid that until a request went to `undefined/repos/...`.

The default now resolves in `TypedVariablesService`, which is the layer that knows what was declared — `VariablesService` only knows what a host put in it. A stored value always wins; a schema with no default still resolves to `undefined`.

`VariableStatus` gains `hasDefault`, and `getMissing()` no longer lists a variable that defaults: it has a value, just not one anybody has to supply. `isConfigured` still means what it said — that a host set it.

For this to work the generated `TYPED_VARIABLES_META` now carries the schema as a value rather than only `z.infer`-ing its type, so the schema module is retained in the emit instead of being elided.
