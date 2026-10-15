---
type: decision
title: Bearer token hashes are unpeppered SHA-256
description: hashToken stores bearer tokens as plain SHA-256 hex because they are high-entropy random values; a low-entropy secret is not a hashed column
tags: core, classification, security
---

# Bearer token hashes are unpeppered SHA-256

`hashToken` in `packages/core/src/classification/column-form.ts:21-32` returns the
lowercase hex SHA-256 of its input through WebCrypto. The doc comment at `:8-15`
gives the reason: bearer tokens are high-entropy random values with no candidate
set to search, so a pepper would add a key to manage and a rotation story while
buying nothing. The same comment says a column that holds a low-entropy secret is
not a `hashed` column and needs a password KDF instead.

**What this rules out:** adding a pepper or key to token hashes, and using this
hash for passwords or other low-entropy values.
