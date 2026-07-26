# @pikku/jose

JWT service for Pikku, backed by [jose](https://github.com/panva/jose).

Takes a secret getter rather than a static key, so secrets can be rotated
without restarting — the newest secret signs, and any listed secret verifies.

## Install

```bash
npm install @pikku/jose
```

## Usage

```typescript
import { JoseJWTService } from '@pikku/jose'

const jwt = new JoseJWTService(
  async () => [{ id: 'v1', value: await secrets.get('JWT_SECRET') }],
  logger
)
```

## Docs

https://pikku.dev/docs
