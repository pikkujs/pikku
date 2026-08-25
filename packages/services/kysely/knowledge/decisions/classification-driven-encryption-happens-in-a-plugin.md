---
type: decision
title: Classification-driven encryption happens in a Kysely plugin
description: The existing column classification manifest drives a transparent query plugin, rather than encrypting the whole database file or asking call sites to encrypt
tags: [security, encryption, kysely, classification]
---

# Classification-driven encryption happens in a Kysely plugin

Encrypting a local database at rest has two obvious shapes and both were
rejected. Encrypting the **whole file** on shutdown and decrypting on startup is
the simplest to describe and the easiest to lose data with: a crash, a battery
death, or two processes racing the same file leaves a half-written database with
no recovery story. Encrypting **every column** keeps the file safe but destroys
the database — you cannot `WHERE`, `ORDER BY`, or join on ciphertext, so the app
either reads whole tables into memory or stops using SQL.

The middle answer already exists in the repo. `classification.gen.ts` is a
per-column manifest of `private` / `secret` / `public` with a `form` of `plain`,
`hashed`, `wrapped` or `sealed`. Only `wrapped` and `sealed` columns are
encrypted; everything else stays queryable, which is most of the schema. The
manifest is generated from the hand-authored `db/annotations.ts` by
`pikku db migrate`, so the decision about a column is made once, in one place,
and the query layer follows it.

Enforcement belongs in a **Kysely plugin**, not at call sites. A call site that
forgets to encrypt writes plaintext into a column the manifest says is secret,
and nothing catches it — the row looks fine. A plugin sits in the query path
every write goes through, so "encrypted" becomes a property of the column rather
than a property of the developer's memory. It transforms values on the way in
and back on the way out, and the application code is unchanged.

That plugin lives here, in `@pikku/services-kysely`, and not in a SQLite-specific
package. Nothing about wrapping a column value is dialect-specific, and the same
plugin is wanted against Postgres — fabric has the same classified columns and
the same reason to protect them. Putting it beside the dialect would mean
writing it twice.

The `hashed` form must never be encrypted, and the existing `ColumnForm` JSDoc
already says why: a token hash *is* the lookup key, so encrypting it makes the
lookup impossible.

The cost was measured on an M-series Mac rather than estimated: envelope
encryption runs about **38µs per value** to write and **33µs** to read, which
over 500 rows batched with `Promise.all` is roughly **9ms**. Key derivation is
the expensive step at **~48ms**, and it happens once, at unlock.

**What this rules out:** SQLCipher or whole-file encryption, encrypting every
column, and any design where an application function calls the crypto helpers
directly.
