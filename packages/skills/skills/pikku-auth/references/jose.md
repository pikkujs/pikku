# Pikku Jose (JWT Service)


## Installation

```bash
yarn add @pikku/jose
```

## API Reference

### `JoseJWTService`

```typescript
import { JoseJWTService } from '@pikku/jose'

const jwt = new JoseJWTService(
  getSecrets: () => Promise<Array<{ id: string; value: string }>>,
  logger?: Logger
)

await jwt.init()
```

**Constructor Parameters:**

- `getSecrets` — Async function returning an array of `{ id, value }` key pairs. The **first** entry signs; every entry can verify.
- `logger` — Optional logger instance.

**Methods:**

- `init(): Promise<void>` — Fetch and cache secrets. Call at startup.
- `encode<T>(expiresIn: RelativeTimeInput, payload: T): Promise<string>` — Create a signed JWT, stamping the signing key's `id` as the token's `kid` header.
- `decode<T>(token: string): Promise<T>` — **Verifies** the signature and expiry, then returns the payload.
- `verify(token: string): Promise<void>` — The same check, discarding the payload.

`decode` is not an unchecked read: both methods run `jose.jwtVerify` and both
throw on a bad signature or an expired token. There is no way to inspect an
untrusted payload through this service — reach for `jose.decodeJwt` directly if
you genuinely need that, and treat the result as unauthenticated input.

Tokens are signed **HS256** with a symmetric secret. The algorithm is fixed and
pinned on verification, so a token arriving with any other `alg` is rejected —
but it also means this service has no asymmetric (RS256/ES256) mode.

`init()` is not strictly required: `encode` calls it lazily on first use. Call it
at startup anyway so a missing or unreachable secret fails at boot rather than
on the first request that needs a token.

## Usage Patterns

### Basic Setup

```typescript
import { JoseJWTService } from '@pikku/jose'

const jwt = new JoseJWTService(
  async () => [{ id: 'key-1', value: await secrets.getSecret('JWT_SECRET') }],
  logger
)
await jwt.init()
```

A signing key is a secret, so it comes from the secrets service rather than
`process.env` — and because `getSecrets` is a function called on demand, reading
it there (not once at construction) is what makes the re-init-on-unknown-kid path
above actually see a rotated key. See `pikku-services`.

### Secret Rotation

Supply multiple keys. The first signs; the rest stay available for verification:

```typescript
const jwt = new JoseJWTService(async () => [
  { id: 'key-2', value: NEW_SECRET }, // signs with this
  { id: 'key-1', value: OLD_SECRET }, // still verifies tokens signed with this
])
```

Verification resolves the key by the token's `kid` header rather than trying each
secret in turn — which is why `encode` stamps the signing key's `id` there, and
why the ids must stay stable across a rotation. Keep an id in the list for as
long as tokens bearing it can still be in flight.

When a `kid` isn't in the cache, the service re-runs `getSecrets()` once before
giving up with `Missing secret for id: <kid>`. That is what lets a running server
pick up a newly added key without a restart, provided `getSecrets` reads from
something live (a secret store) rather than a value captured at boot. A token
with no `kid` at all falls back to the current signing key.

### With Pikku Services

```typescript
const createSingletonServices = pikkuServices(async (config) => {
  const logger = new ConsoleLogger()
  const jwt = new JoseJWTService(
    async () => [{ id: 'my-key', value: config.jwtSecret }],
    logger
  )
  await jwt.init()
  return { config, logger, jwt }
})
```

### Encoding & Verifying Tokens

```typescript
const token = await jwt.encode('1h', { userId: 'abc', role: 'admin' })

await jwt.verify(token) // throws if invalid/expired

const payload = await jwt.decode<{ userId: string; role: string }>(token)
```
