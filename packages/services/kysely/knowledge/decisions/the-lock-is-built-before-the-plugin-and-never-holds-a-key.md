---
type: decision
title: The lock is built before the plugin, and the plugin never holds a key
description: Assembly order for classified columns — a plain Kysely handle, then the vault, then the lock, then a plugin that asks the lock per operation rather than being handed a key
tags: [security, encryption, kysely, classification]
---

# The lock is built before the plugin, and the plugin never holds a key

The pieces look circular the first time you assemble them: the plugin needs a
key, the key comes from a `DataLock`, the lock reads its records from a table,
and the table is read through Kysely. It resolves because two of those arrows are
not what they appear to be.

```ts
const db = new Kysely<DB>({ dialect })
const vault = new KyselyLockVault(db)
const lock = new DataLock(vault)
await lock.init()

const crypto = new ClassificationCrypto({
  resolveKEK: createDataLockResolver(lock),
})
const classified = db.withPlugin(
  createClassificationPlugin({ manifest, crypto })
)

wireDataLock(lock, { keyIds: keyIdsFromManifest(manifest) })
```

**The vault reads through the plain handle, not the classified one.** Its table
holds salts and verifiers, which are not secret and are not classified, so it
needs no plugin — and it must be readable while the store is locked, or a store
could never find out how to open itself.

**`init()` reads records, it does not open anything.** After it, `lock.state` can
answer `uninitialized`, `locked` or `unlocked`, and the server is ready to serve
its unlock screen. No passphrase has been anywhere near the process.

**The plugin is given a resolver, never a key.** `createDataLockResolver` asks
the lock *per operation*. That is the whole reason the key can arrive after
everything around it has been constructed: the passphrase comes in over HTTP
minutes or days later, and neither the services, the Kysely instance nor the
plugin are rebuilt. It also means a later `lock()` takes the key back mid-life,
and the next classified query fails rather than using a stale one.

**`keyIds` is fixed at wiring time**, from the manifest. The unlock screen posts
a passphrase and nothing else, so there is nowhere else for the list to come
from — and a key the schema names but nobody minted does not fail at startup, it
fails at the first write to that one column.

**What this rules out:** constructing the Kysely instance with the classification
plugin already attached (there is no lock yet), giving the vault the classified
handle, resolving a key once and caching it in the plugin, and letting a caller
choose which keys `initialize` mints.

Related: [[classification-driven-encryption-happens-in-a-plugin]],
[[keks-are-scoped-by-purpose-as-well-as-version]].
