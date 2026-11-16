# @pikku/keys

The Pikku key service. It implements the `KeyService` interface from
`@pikku/core/keypair` for keys declared with `defineKeyPair`: signing and
sealing keys with rotation, custody and revocation.

```typescript
import { createLocalKeyService, MemoryKeyStore } from @pikku/keys
import { FileCustody, FileKeyStore } from @pikku/keys/file

const keys = await createLocalKeyService({
  definitions: keyPairsMeta, // generated `pikku-keypairs-meta.gen.json`
  store: new FileKeyStore(.pikku/keys.json),
  fileCustody: new FileCustody(.pikku/keys),
})

await keys.reconcile() // mints the first key, rotates when due

const signer = await keys.signer(audit, { domain: audit-v1 })
const signature = await signer.sign(row)
await keys.verify(audit, row, signature, { domain: audit-v1, kid: signer.kid })
```

- The root entry uses WebCrypto only and imports nothing from `node:`, so it
  runs on Node, Bun and Workers. `@pikku/keys/file` is the Node-only subpath.
- Custody `secret` needs a `SecretService` that declares `durable: true` (or a
  host that asserts `secretsDurable`). `LocalSecretService` is refused.
- A name is `signedFormat: domain` (the default: pass a `domain`) or `jws`
  (use `signJws`, pass no domain). The wrong form throws `DomainPolicyError`.
- Agents that verify outside this service must build the signed bytes with
  `prefixWithDomain`, not a hand copy.
- No method returns private bytes; no error or log line carries any.
