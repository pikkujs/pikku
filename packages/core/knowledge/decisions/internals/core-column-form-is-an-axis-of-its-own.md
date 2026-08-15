---
type: decision
title: A column's at-rest form is an axis of its own
description: How a value is stored is independent of how sensitive it is, so form carries a required nominal brand on writes while classification stays optional on reads
tags: core
---

# A column's at-rest form is an axis of its own

`ColumnForm` in `packages/core/src/data-classification.ts` is a second,
independent annotation on a column: `plain | hashed | wrapped | sealed`. It
answers "how are these bytes held?", where `Classification` answers "may this
value leave the process?".

The two axes were one field before this, with `security: 'encrypted'` sitting
alongside `secret` as though they were alternatives. They are not, and the
conflation made the field unanswerable: a token hash and a live bearer token are
both `secret`, one must never be encrypted — the digest _is_ the lookup key —
and the other must always be. Nothing in a single enum could tell them apart, so
nothing could check either.

## Why `wrapped` and `sealed` rather than `encrypted`

Sealed values _are_ encrypted, so an `encrypted` member sitting beside `sealed`
would be a supertype posing as a sibling, and every new column would be an
even-odds guess. What actually separates them is who can read the value back:
`wrapped` is symmetric and the application holds the key; `sealed` is asymmetric
and the application holds only the public half. Writing one where the other
belongs produces a row nobody can ever open, which is why the type system is
made to know the difference.

## Why these brands are required when `Secret<T>` is optional

`WrappedValue`, `SealedValue` and `HashedValue` are `string & { readonly [sym]:
true }` with a `unique symbol` — nominal, and **required**, which
[the classification-brand decision](core-data-classification-brand-is-an-optional-property.md)
explicitly rules out for `Private`/`Pii`/`Secret`. That decision still stands and
this does not weaken it. It applies to a different side of a different set of
columns:

- `Secret<T>` brands **every** classified column's SELECT type. A required brand
  there would break `where('email', '=', someString)` in every downstream
  project.
- A form brands **only** the INSERT/UPDATE type, and only on the columns that
  opt in by declaring a form. There is nothing to break, because a column
  without a form generates exactly what it generated before.

The brands compose rather than compete: a wrapped secret column selects as
`Secret<WrappedValue>`, so the inspector's PKU910 check still finds
`__classification__`, while a row read back is already a `WrappedValue` and
flows into a rewrap or re-seal without a cast.

Each brand widens to `string`, so query operands, serialization and template
literals are unaffected. The constraint is on **construction**: the only way to
produce one is `envelopeEncrypt`/`envelopeRewrap`/`wrapDEK` (wrapped) or
`hashToken` (hashed), or the deliberately-named `unsafeAs*` assertions in
`column-form.ts` for the three cases a bare string legitimately arrives —
backfill migrations, test fixtures, and values sealed by another service.

## What is deliberately NOT enforced

`envelopeDecrypt` and `unwrapDEK` take plain `string`, not the brand. Requiring
it would buy nothing — feeding in the wrong string already fails at the AEAD tag
— while forcing a cast into every path that reads ciphertext out of a row or off
the wire, which is where casts are least reviewable.

The brand proves _provenance_, not correctness. It cannot know a value was
wrapped under the right key, and making it know would mean phantom-typing key
ids per scope, which the multi-recipient path would fight constantly.

## The plain-secret diagnostic

A `secret` column with no declared form raises **PKU483** as a warning, not an
error. Every project predating the axis has such columns, and failing their next
`db migrate` would be a breaking change for a diagnosis they have not had a
chance to act on. `pikku db --fail-on-warn` is how a project opts into the
ratchet. An explicit `form: 'plain'` silences it — that is the acknowledgement
that reading the row is _meant_ to yield a usable credential.

**What this rules out:** collapsing `wrapped` and `sealed` back into one
`encrypted`; making the form brands optional (they would enforce nothing);
re-declaring them in generated schema files, since a local `unique symbol` is a
distinct nominal type and core's own ciphertext would not be assignable to the
column it belongs in — `db-codegen` imports them from `@pikku/core` instead.
