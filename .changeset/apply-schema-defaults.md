---
'@pikku/core': patch
---

Apply schema defaults, which nothing was ever filling in

A `default` on an input property reaches the generated JSON Schema and keeps
that property out of `required`, so a call that omits it validates. Nothing
then filled it in: JSON Schema validators are pure by specification, and
neither `@cfworker/json-schema` nor Ajv (without `useDefaults`) annotates the
instance being checked. The function received `undefined` for a property its
own generated type declares as present.

That is the worst shape the mismatch can take. Validation permits the omission,
the type promises a value, and the body reads `undefined` — so it surfaces far
from its cause, as `const offset = (page - 1) * limit` evaluating to `NaN` and
`.limit(undefined)` reaching the database on a paginated call made with no
arguments.

Defaults are now filled in before validation, on every path. Deliberately not
gated on `coerceDataFromSchema`, the flag guarding the neighbouring coercion
step: that flag is about decoding transport-encoded values (a query string's
`"1,2"` into an array) and is absent on a direct RPC invocation. A default
belongs to the schema rather than to the transport a call arrived on, so
gating it there would fill defaults over HTTP and skip them on RPC.

Filling is by presence rather than truthiness, so a supplied `0` or `false`
survives, and a call made with no arguments at all still gets its defaults.
Values are cloned, because an object or array default would otherwise be a
single mutable instance shared by every request in the process — one request's
`push` showing up in the next.

Nothing needs to change in generated types or call sites: both were already
written as though defaults worked. This makes them true.
