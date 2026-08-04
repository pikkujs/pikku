---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

Split a column's at-rest form out of its classification.

`security: 'encrypted'` sat beside `'secret'` as though the two were
alternatives, which made the field unanswerable: a token hash and a live bearer
token are both secret, one must never be encrypted — the digest *is* the lookup
key — and the other must always be. A column now carries a second, independent
`form: 'plain' | 'hashed' | 'wrapped' | 'sealed'` saying how the bytes are held.

Declaring a form other than `plain` makes the column's INSERT/UPDATE type
nominal — `WrappedValue`, `SealedValue`, `HashedValue` — so a plain string no
longer compiles there and the only way to write the column is with something an
encrypt, seal or hash call produced. `envelopeEncrypt`, `envelopeRewrap` and
`wrapDEK` now return the brand, and a new `hashToken` produces `HashedValue`, so
the round trip needs no casts; `column-form.ts` exports deliberately-named
`unsafeAs*` assertions for backfills, fixtures and values sealed elsewhere.
Reads are unaffected — the brands widen to `string` and compose with the
classification brand as `Secret<WrappedValue>`.

`wrapped` and `sealed` stay distinct because a sealed value is one the
application cannot read back; storing one where the other belongs is a row
nobody can open.

A `secret` column that has not declared a form now warns (PKU483), and a form on
a non-text column warns and is dropped (PKU484). Both are warnings, so existing
projects keep migrating — `pikku db --fail-on-warn` opts into the ratchet, and
an explicit `form: 'plain'` is the acknowledgement that silences it. The legacy
`security: 'encrypted'` keeps working and now expands to the pair it always
meant, `secret` + `wrapped`.
