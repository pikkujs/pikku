---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
'@pikku/kysely': patch
'@pikku/aws-services': patch
'@pikku/better-auth': patch
'@pikku/pino': patch
'@pikku/azure-functions': patch
'@pikku/addon-graph': patch
'@pikku/addon-console': patch
---

`SecretService` now returns a `SecretValue<T>` rather than the bare value, so a
vault secret cannot reach a sink by accident.

`SecretValue` is nominally typed, which means it is not assignable to `string`
(or to any other concretely-typed field). Every sink with a real type — a
database column, an email body, a session payload — rejects it with no lint
rule involved. The sinks typed `any`, `unknown`, or a free generic — the logger,
queue payloads, webhook and email inputs, and a function's own output — are
guarded with `Safe<T>`, which collapses a `SecretValue` found anywhere inside
`T`, however deeply nested, to `never`.

Unwrap deliberately at the point the secret reaches the wire:

```ts
const secret = await secrets.getSecret('BETTER_AUTH_SECRET')
betterAuth({ secret: secret.reveal() })
```

Two behaviours cover what types cannot see. Structured serialization redacts —
`JSON.stringify` and node's inspect both yield `[secret]`, so an audit or log
write stays honest without crashing the request. String coercion throws
`SecretCoercionError`, because a template literal is always a leak.

`.reveal()` is the deliberate escape hatch, and what it hands back is an
ordinary string as far as every sink signature is concerned. **PKU953** closes
that gap: under `pikku all --security` the inspector reports a revealed secret
that flows into a logger, an audit, a queue, an email or a webhook — `console` included.

This also fixed a real one: `remote-addon-auth.ts` called `String(token)` on an
`unknown` and wrote the result straight into an `Authorization` header.
