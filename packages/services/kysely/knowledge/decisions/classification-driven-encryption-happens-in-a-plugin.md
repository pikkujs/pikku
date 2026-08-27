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
than a property of the developer's memory.

Transparency turned out to be **asymmetric**, and the implementation says so.
Reads are genuinely transparent: `transformResult` is async, so ciphertext is
decrypted on the way out and application code is unchanged. Writes are not.
`transformQuery` is synchronous — it returns a `RootOperationNode`, not a
promise — and WebCrypto is async, so the plugin cannot encrypt on the way in.
What it does instead is **refuse**: plaintext heading for a `wrapped` or
`sealed` column throws, and values are produced by
`ClassificationCrypto.encryptColumn()`. The security property is intact — a
forgotten call site is a loud error rather than a silent plaintext row — but
"transparent" describes only half of it.

Two alternatives were rejected to get there. Node's synchronous `crypto` would
fork crypto away from core and break every non-Node runtime. Proxying the query
builder is the kind of workaround the repo bans. A **`Driver` wrapper**
encrypting compiled-query parameters *would* deliver full write transparency and
reuses the manifest walk and resolver verbatim, so it stays open — but it needs
a parameter-index-to-column mapping recovered after compilation, and that
mapping goes fragile exactly where inserts get interesting (multi-row,
`onConflict().doUpdateSet()`). A mapping that is subtly wrong encrypts the wrong
column, which is worse than the problem it solves. Not worth it until the write
path is the thing actually hurting.

That plugin lives here, in `@pikku/kysely`, and not in a SQLite-specific
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
