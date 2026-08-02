---
type: decision
title: The KEK salt is scoped to the key version, not the secret
description: One stored salt per key version means N secrets cost one derivation, which is the point of envelope encryption
tags: crypto, storage
---

# The KEK salt is scoped to the key version, not the secret

Each secret and credential service stores one random salt per `keyVersion`,
generated on first use and read once — a `secretKekSalts` / `credentialKekSalts`
table for kysely, a hash field for redis, a document for mongodb. `deriveKEK`
runs against that salt to produce a `CryptoKey`, which is what
`wrapDEK`/`unwrapDEK`/`envelope*` accept. The wrapped-DEK blob therefore carries
no salt of its own: `[iv:12][ct+tag]`.

Envelope encryption exists so the expensive derivation happens once and many
cheap DEK unwraps follow. A per-secret salt destroys that: every
`envelopeDecrypt` re-derives, so `getSecrets` over 50 rows cost 50 × PBKDF2-600k
(~2.3s) and rotation cost twice that. Scoping the salt to the key version
restored the intended shape — one derivation for a bulk read, two for a
rotation.

Keying by version rather than storing a single salt is what lets `getKEK` keep
serving `previousKey` for older rows during rotation.

A salt's job is to defeat precomputation across deployments and passphrases; one
random salt per deployment per key version achieves that fully. Per-ciphertext
salt only buys something when each ciphertext might use a different passphrase,
which is never the case here. Storing the salt rather than taking it as
configuration keeps it off the operator's plate — it needs to be
deployment-random, not secret.

**What this rules out:** deriving the KEK inside a per-row loop; a salt shared
across key versions, which would break rotation; a deterministic salt derived
from the version number, which is the same salt in every deployment and so
restores the rainbow table; and caching derived keys anywhere but a read-through
instance map whose source of truth is the store.

See [[passphrases-are-stretched-key-material-is-expanded]].
