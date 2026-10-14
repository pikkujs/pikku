---
type: decision
title: A vault secret redacts when serialized and throws when coerced to a string
description: SecretValue serializes to a redacted marker so logs stay honest without crashing, but string coercion throws, and reveal() is the only way to read the value
tags: core, secrets, classification
---

# A vault secret redacts when serialized and throws when coerced to a string

`packages/core/src/classification/secret-value.ts` wraps a vault value in
`SecretValue`. The raw value sits in a private field (`secret-value.ts:37`) and
is returned only by `reveal()` (`secret-value.ts:43-45`).

Two paths out of the wrapper behave differently on purpose:

- Structured serialization is redacted. `toJSON` and the Node inspect hook both
  return `REDACTED`, which is `[secret]` (`secret-value.ts:5`, `47-53`). The doc
  comment says an audit or log write "must stay honest about the field without
  crashing the request" (`secret-value.ts:29-30`).
- String coercion throws. `toString` and `Symbol.toPrimitive` both throw
  `SecretCoercionError` (`secret-value.ts:55-61`). The comment says "a template
  literal or concatenation is always a leak" (`secret-value.ts:31`).

The `Safe<T>` type (`secret-value.ts:91-106`) rejects a `SecretValue` anywhere
in a type, for sinks typed `any`, `unknown` or a free generic.

**What this rules out:** reading a secret without calling `reveal()`, putting a
secret into a template literal or string concatenation, and a logger that
crashes on a secret field instead of redacting it.
