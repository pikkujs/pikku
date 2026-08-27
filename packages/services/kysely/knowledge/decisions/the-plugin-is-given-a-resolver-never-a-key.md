---
type: decision
title: The plugin is given a resolver, never a key
description: Assembly order for classified columns — a plain Kysely handle, then a plugin that asks a `KEKResolver` per operation rather than being handed a key it holds for the life of the process
tags: [security, encryption, kysely, classification]
---

# The plugin is given a resolver, never a key

The pieces look circular the first time you assemble them: the plugin needs a
key, and whatever produces that key may itself need to read from the database.
It resolves because the plugin is never handed a key at all.

```ts
const db = new Kysely<DB>({ dialect })

const crypto = new ClassificationCrypto({ resolveKEK })
const classified = db.withPlugin(
  createClassificationPlugin({ manifest, crypto })
)
```

**The plugin is given a resolver, never a key.** `resolveKEK` is asked _per
operation_. That is the whole reason a key can arrive after everything around it
has been constructed — neither the services, the Kysely instance nor the plugin
are rebuilt when it does — and it is why a key source that later becomes
unavailable makes the next classified query fail rather than use a stale key.

**A resolver that reads from the database reads through the plain handle**, not
the classified one, and whatever it reads must not itself be classified. A key
source that needed its own key to be read could never answer.

**A resolver may derive a KEK any way it likes**, as long as the same `keyId`
resolves to the same key: from a passphrase, from a KMS, from an environment
secret. `ClassificationCrypto` only requires the key and the version it should
stamp into the envelope. Deriving on every call is the mistake to avoid — key
stretching is the expensive step, so a resolver caches per `keyId`.

**What this rules out:** constructing the Kysely instance with the classification
plugin already attached before a key source exists, giving a database-backed
resolver the classified handle, and resolving a key once to cache it inside the
plugin.

Related: [[classification-driven-encryption-happens-in-a-plugin]],
[[keks-are-scoped-by-purpose-as-well-as-version]].
