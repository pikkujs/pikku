---
type: decision
title: Every key a column names is minted at initialize, from the manifest
description: A keyId nobody initialized does not fail at startup — it fails at the first write to one column, possibly months later, so the list is derived from the classification manifest rather than typed by hand
tags: core
---

# Every key a column names is minted at initialize, from the manifest

`DataLock.initialize(passphrase, keyIds)` mints one record — salt, version,
verifier — per key id. `keyIdsFromManifest`
(`packages/core/src/classification/key-ids.ts`) produces that list by walking the
generated classification manifest and collecting the `keyId` of every `wrapped`
or `sealed` column, defaulting to `DEFAULT_KEY_ID` where a column names none.
Bootstrap passes the two together; nobody types the list.

The reason is the failure mode of getting it wrong. A key id a column names but
nobody initialized does **not** fail at startup — the store opens, every other
column works, and the miss surfaces at the first read or write of that one
column. That can be months after the deploy that introduced it, in a code path
nobody had exercised, and it arrives as an error about keys in a request that
was about something else entirely.

`hashed` columns contribute nothing, because a hash is the lookup key and
encrypting it breaks the lookup it exists for. The order is sorted so a
regenerated manifest does not reshuffle the records it produces.

For the same reason, `getKEK` and `getKeyVersion` distinguish an **unknown key
id** from a **locked store**. Both used to throw `DataLockedError`, which reads
as "supply the passphrase" and sends whoever is holding the log off to find one
for a store that is already open. An unknown key id is now a plain `Error`
naming the id and pointing at `initialize()`; `DataLockedError` means the lock
state and nothing else. It still fails closed either way — nothing is written in
plaintext because a key could not be found.

**What this rules out:** taking the key id list from a config file or a caller's
literal, defaulting an unknown key id to the default key (which would silently
seal two purposes under one key), and reusing `DataLockedError` for a
configuration mistake.

Related: [[the-unlock-gate-is-served-over-http-not-prompted-natively]].
