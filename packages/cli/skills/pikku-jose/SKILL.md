---
name: pikku-jose
description: 'Use when setting up JWT authentication with the jose library in a Pikku app. Covers JoseJWTService constructor, secret rotation, token encoding/decoding/verification.
TRIGGER when: code uses JoseJWTService, user asks about JWT setup, token signing, token verification, or @pikku/jose.
DO NOT TRIGGER when: user asks about session middleware (use pikku-security) or general service setup (use pikku-services).'
---

# Pikku Jose (JWT Service)

`@pikku/jose` provides JWT signing, verification, and decoding using the [jose](https://github.com/panva/jose) library. Implements the `JWTService` interface from `@pikku/core`.

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
- `getSecrets` — Async function returning an array of `{ id, value }` key pairs. First key is used for signing; all keys are tried for verification (supports rotation).
- `logger` — Optional logger instance.

**Methods:**
- `init(): Promise<void>` — Fetch and cache secrets. Call at startup.
- `encode<T>(expiresIn: RelativeTimeInput, payload: T): Promise<string>` — Create a signed JWT.
- `decode<T>(token: string): Promise<T>` — Decode a JWT payload without verification.
- `verify(token: string): Promise<void>` — Verify a JWT signature and expiry.

## Usage Patterns

### Basic Setup

```typescript
import { JoseJWTService } from '@pikku/jose'

const jwt = new JoseJWTService(
  async () => [{ id: 'key-1', value: process.env.JWT_SECRET! }],
  logger
)
await jwt.init()
```

### Secret Rotation

Supply multiple keys. The first is used for signing; all are tried for verification:

```typescript
const jwt = new JoseJWTService(async () => [
  { id: 'key-2', value: NEW_SECRET },   // signs with this
  { id: 'key-1', value: OLD_SECRET },   // still verifies tokens signed with this
])
```

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
