---
type: decision
title: Passphrases are stretched, key material is expanded
description: PBKDF2 guards low-entropy human input; HKDF derives from high-entropy secrets, and the two are never swapped
tags: crypto
---

# Passphrases are stretched, key material is expanded

`packages/core/src/crypto-utils.ts` carries two derivation paths that look
alike and are not interchangeable.

`encryptJSON` / `decryptJSON` take a **passphrase** and run PBKDF2-HMAC-SHA256
at 600,000 iterations over a per-message random salt. They protect data at rest
— the secret and credential services — where the KEK may be something a human
chose, so the work factor is the only thing standing between a leaked ciphertext
and a dictionary.

`encryptWithKeyMaterial` / `decryptWithKeyMaterial` take **high-entropy key
material** and use HKDF-SHA256, which is effectively free. They protect the
remote-RPC session envelope, whose secret is a generated deployment value. HKDF
offers no brute-force resistance at all, which is why the minimum length is
enforced fail-closed at both ends: the entropy has to live in the secret,
because nothing else supplies it.

The split exists because the cost profiles are opposites. Stretching on a
per-request path cost ~269ms per remote hop and would have consumed most of a
Cloudflare Workers CPU budget; expanding a human passphrase would leave it
one cheap hash from being guessed. Both blobs use the same
`[salt:16][iv:12][ct+tag]` layout, so they are indistinguishable on the wire but
cryptographically disjoint — feeding one to the other's verifier rejects.

The `info` parameter namespaces each use of the same key material, so a key
derived for one purpose cannot decrypt another's payload.

**What this rules out:** using `encryptJSON` on any per-request path; using the
key-material functions for anything a human types; sharing one derived key
across two purposes by passing the same `info`; and lowering the minimum length
to accommodate an existing short secret. See
[[the-kek-salt-is-scoped-to-the-key-version]].
