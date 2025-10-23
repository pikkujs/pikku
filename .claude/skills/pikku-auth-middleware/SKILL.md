---
skill: pikku-auth-middleware
tags: [pikku, middleware, authentication, auth, cookies, jwt, bearer, api-key]
---

# Pikku Authentication Middleware Helpers

Pikku provides pre-built authentication middleware helpers for common authentication patterns.

## Available Middleware

All auth middleware is imported from `@pikku/core/middleware`:

```typescript
import {
  authAPIKey, // API key authentication (header or query)
  authBearer, // Bearer token authentication
  authCookie, // Cookie-based session management
  timeout, // Request timeout middleware
} from '@pikku/core/middleware'
```

## Middleware List

### authAPIKey

Extracts API key from `x-api-key` header or `apiKey` query parameter and decodes using JWT service.

**See:** `examples/auth-apikey-jwt.ts`
**Custom:** For database lookups, see `examples/auth-apikey-database.ts`

### authBearer

Extracts Bearer token from `Authorization` header. Supports JWT decoding or static token validation.

**See:** `examples/auth-bearer-jwt.ts`
**Custom:** For database validation, see `examples/auth-bearer-custom.ts`

### authCookie

Reads session from cookies using JWT and automatically updates cookies when session changes.

**See:** `examples/auth-cookie-jwt.ts`
**Custom:** For custom encoding, see `examples/auth-cookie-database.ts`

### timeout

Throws timeout error if request takes longer than specified duration.

**See:** `examples/timeout-middleware.ts`

## Important Patterns

**All auth middleware:**

- Skip if session already exists (don't overwrite)
- Only work with HTTP interactions
- Use `userSessionService.setInitial()` to populate session
- Should NOT throw on missing credentials (let auth/permissions handle it)

**JWT requirement:**
The built-in middleware requires the JWT service to be configured. For custom authentication logic (database lookups, custom encoding), create your own middleware using `pikkuMiddleware` from `#pikku/pikku-types.gen.js`.

**CRITICAL:** When creating custom middleware, always import `pikkuMiddleware` from `#pikku/pikku-types.gen.js`, never from `@pikku/core`.

**Combining multiple auth methods:**

```typescript
addHTTPMiddleware('*', [
  authBearer(),
  authCookie({
    name: 'session',
    expiresIn: { value: 30, unit: 'day' },
    options: { httpOnly: true, secure: true, sameSite: 'strict', path: '/' },
  }),
  authAPIKey({ source: 'all' }),
])
```

They run in order and skip if session already set. The `'*'` pattern applies middleware to all routes.

## Custom Middleware Pattern

When creating custom middleware, always follow this pattern:

```typescript
import { pikkuMiddleware } from '#pikku/pikku-types.gen.js'

export const myCustomAuth = pikkuMiddleware(
  async ({ userSession, ...otherServices }: any, { http }, next) => {
    // Your custom logic here
    return next()
  }
)
```

**See examples:** `auth-apikey-database.ts`, `auth-bearer-custom.ts`, `auth-cookie-database.ts`

## Review Checklist

- [ ] Using built-in middleware? Import from `@pikku/core/middleware` and ensure JWT service is configured
- [ ] Using custom middleware? Import `pikkuMiddleware` from `#pikku/pikku-types.gen.js`, **NEVER** from `@pikku/core`
- [ ] Apply with `addHTTPMiddleware('*', [...])` where `'*'` matches all routes
- [ ] Cookie options include `httpOnly: true` and `secure: true` in production
- [ ] Don't throw errors for missing credentials (let permissions handle it)
