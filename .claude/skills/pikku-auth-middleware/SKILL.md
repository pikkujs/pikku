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

Extracts API key from `x-api-key` header or `apiKey` query parameter. Supports JWT decoding or custom session lookup.

**See:** `examples/auth-apikey-jwt.ts` and `examples/auth-apikey-database.ts`

### authBearer

Extracts Bearer token from `Authorization` header. Supports JWT decoding, static tokens, or custom validation.

**See:** `examples/auth-bearer-jwt.ts` and `examples/auth-bearer-custom.ts`

### authCookie

Reads session from cookies and automatically updates cookies when session changes. Supports JWT encoding/decoding.

**See:** `examples/auth-cookie-jwt.ts` and `examples/auth-cookie-database.ts`

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
When using `jwt: true`, ensure JWT service is configured in services.

**Combining multiple auth methods:**

```typescript
addHTTPMiddleware([
  authBearer({ jwt: true }),
  authCookie({ jwt: true, ... }),
  authAPIKey({ source: 'all', jwt: true })
])
```

They run in order and skip if session already set.

## Review Checklist

- [ ] Import from `@pikku/core/middleware`
- [ ] Use with `addHTTPMiddleware` for reusability
- [ ] JWT service configured if using `jwt: true`
- [ ] Cookie options include `httpOnly: true` and `secure: true` in production
- [ ] Don't throw errors for missing credentials
