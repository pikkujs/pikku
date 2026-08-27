---
type: decision
title: KEKs are scoped by purpose as well as version
description: Rows carry a keyId, and the plugin resolves KEKs through a seam rather than holding one; v1 ships a single key, but scoping never becomes a migration
tags: [security, encryption, kysely, keys]
---

# KEKs are scoped by purpose as well as version

`KyselySecretService` already versions its key-encrypting key: each row stores a
`keyVersion` beside its `ciphertext` and `wrappedDek`, per-version salts live in
their own table, and `rotateKEK` walks rows through `envelopeRewrap`. Version is
the *when* of a key. It is not the *what* — one KEK per version means every
encrypted column in the database is protected by the same secret, so unlocking
anything unlocks everything.

That is acceptable for the first release and wrong as a permanent shape. A
desktop app has one user and one passphrase; a multi-tenant deployment does not,
and "the passphrase that opens my notes also opens my credentials" is a
distinction people expect to be able to draw. So the design keeps scoping
possible without paying for it now.

Two things carry that. Encrypted rows store a **`keyId`** alongside `keyVersion`,
so a row records which key protects it rather than inheriting the answer from
context — retrofitting that column later would mean rewriting every encrypted
row in every deployment. And the plugin does not hold a KEK; it calls a
**resolver** that maps a `keyId` to one. In v1 the resolver returns the same key
for every id. Scoping by tenant, or by purpose, replaces the resolver.

Separate purposes derive from the same key material rather than requiring
separate passphrases. `expandKeyMaterial(keyMaterial, info, salt)` is the HKDF
helper already used for `REMOTE_SESSION_INFO`, and a distinct `info` string per
purpose yields independent keys from one unlock — which is what makes multiple
KEKs practical for a single-user app at all.

The envelope survives all of this unchanged. Core's decision that
[secrets use a per-secret DEK wrapped by a KEK](../../../../core/knowledge/decisions/security/core-secrets-use-a-per-secret-dek-wrapped-by-a-kek.md)
already rules out collapsing it, and scoping is the argument *for* the envelope
rather than against it: rescoping or rotating a key rewraps DEKs, touching a
small constant per row, while a design that encrypted values directly under the
KEK would have to decrypt and re-encrypt every value.

**What this rules out:** a single process-wide KEK with no row-level record of
which key applies, a separate passphrase per purpose, and deferring the `keyId`
column to a later migration.
