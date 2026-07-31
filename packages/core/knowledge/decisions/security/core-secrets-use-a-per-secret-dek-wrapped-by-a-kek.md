---
type: decision
title: Core secrets are encrypted with a per-secret DEK wrapped by a KEK
description: Envelope encryption keeps ciphertext untouched during key rotation, at the cost of storing two blobs per secret
tags: core
---

# Core secrets are encrypted with a per-secret DEK wrapped by a KEK

`packages/core/src/crypto-utils.ts` exposes two layers. `encryptJSON` /
`decryptJSON` are the direct layer: a passphrase is hashed to an AES-GCM key and
the output is `base64url(iv || ciphertext)` with a 12-byte IV. On top of that sit
`envelopeEncrypt`, `envelopeDecrypt` and `envelopeRewrap`, which give every stored
secret its own random 32-byte DEK (data encryption key). The secret is encrypted
with the DEK; the DEK is then encrypted with a KEK (key encryption key) — in
practice an environment variable or platform secret — and the pair
`{ ciphertext, wrappedDEK }` is what gets persisted.

The split exists so that rotating the KEK is cheap and non-destructive.
`envelopeRewrap` unwraps the DEK under the old KEK and re-wraps it under the new
one; the ciphertext of the secret itself is never read, never re-encrypted, and
never re-written. A store holding a million secrets rotates by touching a million
short blobs rather than re-encrypting every payload, and a rotation that fails
part-way leaves both halves independently decryptable by whichever KEK still
wraps them. The `keyVersion` / `previousKey` / `rotateKEK` shape that
`ServiceTestConfig` requires of every `SecretService` and `CredentialService`
implementation (`packages/core/src/testing/service-tests.ts`) is the storage-side
contract that falls out of this.

**What this rules out:** collapsing the envelope back to a single
`encryptJSON(kek, secret)` call, or deriving the DEK from the KEK rather than
generating it randomly. Either change makes the ciphertext depend on the KEK, so
rotation becomes a full re-encrypt of every stored secret and `envelopeRewrap`
stops being correct. It also rules out changing the `iv || ciphertext` layout or
the 12-byte IV length in either layer — the length is hard-coded on the decrypt
side (`data.slice(0, 12)`, minimum length 13), so any change silently fails to
read every previously stored value.
