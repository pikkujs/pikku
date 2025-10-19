---
skill: pikku-auth-middleware
tags: [pikku, middleware, authentication, auth, cookies, jwt, bearer, api-key]
---

# Pikku Authentication Middleware Helpers

Pikku provides pre-built authentication middleware helpers for common authentication patterns. These helpers extract authentication tokens/credentials and populate the user session automatically.

## Import Location

```typescript
import {
  authAPIKey,
  authBearer,
  authCookie,
  timeout
} from '@pikku/core/middleware'
```

## authAPIKey

Middleware that retrieves a session from an API key in the `x-api-key` header or query parameter.

### Signature

```typescript
authAPIKey<SingletonServices, UserSession>({
  source: 'header' | 'query' | 'all',
  jwt?: boolean,
  getSessionForAPIKey?: (services: SingletonServices, apiKey: string) => Promise<UserSession>
})
```

### Parameters

- **source** - Where to look for the API key:
  - `'header'` - Only check `x-api-key` header
  - `'query'` - Only check `apiKey` query parameter
  - `'all'` - Check both header and query
- **jwt** (optional) - If `true`, decode the API key as a JWT token using the JWT service
- **getSessionForAPIKey** (required if jwt=false) - Function that returns a user session for a given API key

### Usage with JWT

```typescript
import { authAPIKey } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

// API key is a JWT token
const apiKeyJWT = authAPIKey({
  source: 'all',  // Check header and query
  jwt: true       // Decode as JWT
})

addHTTPMiddleware('/api', [apiKeyJWT])
```

### Usage with Database Lookup

```typescript
import { authAPIKey } from '@pikku/core/middleware'

const apiKeyAuth = authAPIKey({
  source: 'header',
  getSessionForAPIKey: async ({ database }, apiKey) => {
    const user = await database.query('users', {
      where: { apiKey }
    })

    if (!user) {
      throw new Error('Invalid API key')
    }

    return {
      userId: user.id,
      role: user.role
    }
  }
})

addHTTPMiddleware([apiKeyAuth])
```

## authBearer

Middleware that extracts the Bearer token from the `Authorization` header.

### Signature

```typescript
authBearer<SingletonServices, UserSession>({
  jwt?: boolean,
  token?: {
    value: string,
    userSession: UserSession
  },
  getSession?: (services: SingletonServices, token: string) => Promise<UserSession> | UserSession
})
```

### Parameters

- **jwt** (optional) - If `true`, decode the bearer token as a JWT using the JWT service
- **token** (optional) - Static token configuration: `{ value: 'secret123', userSession: {...} }`
- **getSession** (optional) - Function that returns a user session for a given token

### Usage with JWT

```typescript
import { authBearer } from '@pikku/core/middleware'

const bearerJWT = authBearer({
  jwt: true  // Decode Authorization: Bearer <jwt-token>
})

addHTTPMiddleware([bearerJWT])
```

### Usage with Static Token

```typescript
const bearerStatic = authBearer({
  token: {
    value: 'secret-api-token-123',
    userSession: {
      userId: 'system',
      role: 'admin'
    }
  }
})
```

### Usage with Custom Validation

```typescript
const bearerCustom = authBearer({
  getSession: async ({ database }, token) => {
    const session = await database.query('sessions', {
      where: { token }
    })

    if (!session || session.expiresAt < Date.now()) {
      throw new Error('Invalid or expired token')
    }

    return {
      userId: session.userId,
      role: session.role
    }
  }
})
```

## authCookie

Middleware that extracts a session from cookies. Automatically sets cookies on response if session changes.

### Signature

```typescript
authCookie<SingletonServices, UserSession>({
  name: string,
  options: SerializeOptions,
  expiresIn: RelativeTimeInput,
  jwt?: boolean,
  getSessionForCookieValue?: (
    services: SingletonServices,
    cookieValue: string,
    cookieName: string
  ) => Promise<UserSession>
})
```

### Parameters

- **name** - Cookie name to read/write
- **options** - Cookie serialization options (sameSite, path, httpOnly, secure, etc.)
- **expiresIn** - When the cookie should expire (e.g., `{ value: 7, unit: 'day' }`)
- **jwt** (optional) - If `true`, decode cookie value as JWT
- **getSessionForCookieValue** (required if jwt=false) - Function that returns a user session for a cookie value

### Usage with JWT

```typescript
import { authCookie } from '@pikku/core/middleware'

const cookieJWT = authCookie({
  name: 'session',
  jwt: true,
  expiresIn: { value: 7, unit: 'day' },
  options: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  }
})

addHTTPMiddleware([cookieJWT])
```

**How it works:**
1. Reads `session` cookie from request
2. Decodes JWT to get user session
3. Sets session in userSession service
4. After function runs, if session changed, encodes new JWT and sets cookie in response

### Usage with Database Session

```typescript
const cookieDB = authCookie({
  name: 'sid',
  expiresIn: { value: 30, unit: 'day' },
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  },
  getSessionForCookieValue: async ({ database }, sessionId) => {
    const session = await database.query('sessions', {
      where: { id: sessionId }
    })

    if (!session || session.expiresAt < Date.now()) {
      return null
    }

    return {
      userId: session.userId,
      role: session.role
    }
  }
})
```

## timeout

Middleware that throws a timeout error if the request takes longer than specified.

### Signature

```typescript
timeout(timeout: number)
```

### Parameters

- **timeout** - Timeout in milliseconds

### Usage

```typescript
import { timeout } from '@pikku/core/middleware'

// 30 second timeout for all requests
addHTTPMiddleware([timeout(30000)])

// Different timeout for slow endpoints
wireHTTP({
  method: 'post',
  route: '/api/export',
  func: exportData,
  middleware: [timeout(300000)]  // 5 minutes
})
```

## Important Notes

### Session Population

All auth middleware helpers:
- Skip if a session already exists (don't overwrite)
- Only work with HTTP interactions (check for `http?.request`)
- Use `userSessionService.setInitial()` to populate the session
- Are designed to be non-blocking (don't throw on missing credentials)

### JWT Service Requirement

When using `jwt: true`, ensure you have a JWT service configured:

```typescript
// services.ts
export const services = {
  jwt: createJWTService({ secret: process.env.JWT_SECRET }),
  // ...
}
```

### Cookie Updates

`authCookie` automatically updates cookies when the session changes:
- Monitors `userSessionService.sessionChanged`
- Encodes new session as JWT (if jwt=true)
- Sets cookie with proper expiration

### Combining Multiple Auth Methods

You can combine auth middlewares to support multiple authentication methods:

```typescript
addHTTPMiddleware([
  authBearer({ jwt: true }),    // Try Bearer token first
  authCookie({ jwt: true, ... }), // Fall back to cookie
  authAPIKey({ source: 'all', jwt: true })  // Fall back to API key
])
```

They run in order and skip if session already set.

## Error Handling

Auth middleware should generally NOT throw errors for missing/invalid credentials. Instead:
- Return without setting a session
- Let the function's `auth: true` setting handle authorization
- Or use permission guards for fine-grained control

**Exception:** Some middleware like `authBearer` throws `InvalidSessionError` for malformed tokens.

## Review Checklist

- [ ] Import from `@pikku/core/middleware`, not `@pikku/core`
- [ ] Use with `addHTTPMiddleware`, not inline in wireHTTP (for reusability)
- [ ] JWT service is configured if using `jwt: true`
- [ ] Cookie options include `httpOnly: true` and `secure: true` in production
- [ ] Session functions return consistent user session shape
- [ ] Don't throw errors for missing credentials - let auth/permissions handle it
