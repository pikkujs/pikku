# @pikku/keys

## 0.0.1

### Patch Changes

- f3afcf0: New `@pikku/keys` package: the reference key service for `defineKeyPair` declarations. `createLocalKeyService` signs, verifies, seals-open, rotates, promotes, retires and revokes keys over a `KeyStore` ledger, with the private half in custody `secret`, `file`, `wrapped` or `external`. `signer()` returns a handle that fixes kid, alg and version and re-checks the version status on every sign. Names are `signedFormat: "domain"` by default (signed bytes are `domain || 0x00 || data`, exported as `prefixWithDomain`) or `"jws"` (`signJws` writes `alg` and `kid` from the handle); the wrong form throws `DomainPolicyError`. Custody `secret` is refused on `LocalSecretService` and on any service that does not declare `durable`. `@pikku/keys/file` adds `FileKeyStore` and `FileCustody` (mode 0600); the root entry uses WebCrypto only. `@pikku/core/keypair` gains the `KeyService`, `KeyStore` and related interfaces and the `KeyUnavailableError`, `KeyRetiredError`, `KeyCustodyLostError`, `KeyRotatedError` and `DomainPolicyError` errors; `@pikku/core/hmac` gains `importSpkiVerifyKey` and `verifySpkiSignature`; `okpThumbprint` also accepts X25519 keys.

  Core API notes: `KeySigner` has a required `signedFormat` (`signJws` refuses a handle from a domain name). `@pikku/core/services` also exports `spkiToDer`, `base64ToBytes` and `bytesToBase64` (the strict, canonical helpers; now in `utils/base64`). `importSpkiVerifyKey` takes an optional hash and returns extractable public keys, and `verifyPublicKeySignature` now reads SPKI through `spkiToDer`: base64url keys and PEM armour other than `PUBLIC KEY` no longer verify. `verify` with `historical: true` accepts retired keys but never revoked ones (`revoke` records `metadata.revokedAt`).

- Updated dependencies [ab60937]
- Updated dependencies [04a22b1]
- Updated dependencies [353bc05]
- Updated dependencies [058b973]
- Updated dependencies [9a54796]
- Updated dependencies [d8d339a]
- Updated dependencies [f3afcf0]
- Updated dependencies [f6a9add]
- Updated dependencies [9796787]
- Updated dependencies [83e1d1f]
  - @pikku/core@0.12.159
