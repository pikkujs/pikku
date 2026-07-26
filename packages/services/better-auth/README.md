# @pikku/better-auth

Better Auth integration for Pikku — mounts the auth handler, resolves sessions
into Pikku's user session, and maps roles onto scopes.

## Install

```bash
npm install @pikku/better-auth better-auth
```

## Usage

```typescript
import { createAuthHandler, betterAuthSession } from '@pikku/better-auth'

const authHandler = createAuthHandler(auth)
```

Add `betterAuthSession` to your middleware so Pikku functions see the resolved
session, and `withResolvedScopes` to attach scopes for authorization.

## Docs

https://pikku.dev/docs
