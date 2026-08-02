---
type: decision
title: Schema defaults are applied on every transport, not just HTTP
description: Defaults belong to the schema rather than the call's encoding, so they run unconditionally and are cloned per request
tags: core
---

# Schema defaults are applied on every transport, not just HTTP

`applyDefaultsFromSchema` in `packages/core/src/schema.ts` fills in absent
top-level properties from their JSON Schema `default`, and the function runner
calls it **unconditionally** — before coercion, before validation, on every wire
type.

It exists because a `default` reaches the generated JSON Schema and keeps the
property out of `required`, so omitting it validates. But JSON Schema validators
are pure by specification, and none of the ones Pikku ships with
(`@cfworker/json-schema`, and Ajv unless `useDefaults` is set) annotate the
instance. The function therefore received `undefined` for a property its
generated TypeScript type declares as present — the worst shape a mismatch can
take: validation permits the omission, the type promises the value, the body
reads `undefined`.

It is deliberately *not* gated on the `coerceDataFromSchema` flag that guards
`coerceTopLevelDataFromSchema`. That flag is about decoding transport-encoded
values — a query string's `"1,2"` into an array, an ISO string into a `Date` —
and is set only by transports that need it. Defaults are a property of the
schema, not of how the call arrived, so gating them on that flag would apply them
over HTTP and skip them on a direct RPC invocation. Two smaller rules follow: a
non-null primitive body is returned untouched for the validator to reject rather
than reshaped into something that would pass; and each value is
`structuredClone`d, so an object or array default (`[]`, `{}`) is never shared as
one mutable instance across every request. The result object is allocated only
once a default is actually found, which is what lets a call made with no
arguments at all still receive them.

**What this rules out:** moving the `applyDefaultsFromSchema` call inside the
`if (coerceDataFromSchema)` branch next to the coercion call, or reordering it
after validation. It also rules out dropping the `structuredClone` as an
allocation — the shared-mutable-default bug it prevents is cross-request and
`schema.test.ts` pins it — and rules out replacing the `'default' in property`
presence check with a truthiness check, since `false` and `0` are exactly the
defaults a truthiness check silently discards.
