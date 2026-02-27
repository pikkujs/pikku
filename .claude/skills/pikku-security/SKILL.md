---
name: pikku-security
description: 'Use when adding authentication, authorization, permissions, middleware, or security to a Pikku app. Covers pikkuAuth, pikkuPermission, pikkuMiddleware, built-in auth strategies (bearer, cookie, API key), and permission scoping.'
---

# Pikku Security (Auth, Permissions, Middleware)

Pikku provides a layered security model: authentication middleware (who are you?), auth checks (are you logged in?), and permissions (can you do this?). All work across every transport (HTTP, WebSocket, CLI, queue, etc.).

## Before You Start

```bash
pikku info middleware --verbose    # See existing middleware and where it's applied
pikku info permissions --verbose   # See existing permissions
pikku info functions --verbose     # See which functions have auth/permissions
```

See `pikku-concepts` for the core mental model.

## API Reference

### Session Management

Functions access session via the wire object:

```typescript
// In pikkuFunc (authenticated)
const getProfile = pikkuFunc({
  func: async ({ db }, _data, { session }) => {
    return await db.getUser(session.userId)
  },
})

// Set session (e.g., after login)
const login = pikkuFunc({
  auth: false,
  func: async ({ jwt, db }, { email, password }, { setSession }) => {
    const user = await db.verifyCredentials(email, password)
    setSession({ userId: user.id, role: user.role })
    return { token: jwt.sign({ userId: user.id }) }
  },
})

// Clear session (logout)
const logout = pikkuFunc({
  func: async ({}, _data, { clearSession }) => {
    clearSession()
  },
})
```

### `pikkuAuth(fn)` — Session-Only Checks

Use for authentication gates that only need the session (no request data).

```typescript
import { pikkuAuth } from '#pikku'

// Receives (services, session)
export const isAuthenticated = pikkuAuth(
  async (_services, session) => !!session
)

export const isAdmin = pikkuAuth(
  async (_services, session) => session?.role === 'admin'
)
```

### `pikkuPermission(fn)` — Data-Aware Checks

Use when authorization depends on the actual request data.

```typescript
import { pikkuPermission } from '#pikku'

// Receives (services, data, wire)
export const isOwner = pikkuPermission(
  async ({ db }, { bookId }, { session }) => {
    const book = await db.getBook(bookId)
    return book?.authorId === session?.userId
  }
)

export const hasBookAccess = pikkuPermission(
  async ({ db }, { bookId }, { session }) => {
    return await db.hasAccess(session?.userId, bookId)
  }
)
```

### Permission Groups (OR/AND Logic)

```typescript
{
  admin: isAdmin,                          // OR: admins can access
  owner: isOwner,                          // OR: owners can access
  reviewer: [isAuthenticated, hasAccess],  // AND: both must pass
}
// Logic: admin OR owner OR (isAuthenticated AND hasAccess)
```

### `pikkuMiddleware(fn)` — Before/After Wrapping

```typescript
import { pikkuMiddleware } from '#pikku'

const logRequest = pikkuMiddleware(async ({ logger }, wire, next) => {
  logger.info('Before')
  await next()
  logger.info('After')
})
```

### Built-in Auth Middleware

```typescript
import { authBearer, authCookie, authAPIKey } from '@pikku/core/middleware'

// JWT bearer token — reads Authorization header
addHTTPMiddleware([authBearer()])

// Cookie-based sessions — auto-refreshes JWT
addHTTPMiddleware([
  authCookie({
    name: 'session',
    expiresIn: { value: 30, unit: 'day' },
    options: { httpOnly: true, secure: true },
  }),
])

// API key — from x-api-key header or ?apiKey= query
addHTTPMiddleware([authAPIKey({ source: 'all' })])
```

### Scoping: Where to Apply

Four levels of scoping, from broadest to narrowest:

```typescript
// 1. Global: all HTTP routes
addHTTPMiddleware('*', [authBearer()])

// 2. Prefix-based: URL pattern
addHTTPMiddleware('/admin/*', [auditLog])
addHTTPPermission('/admin/*', { admin: requireAdmin })

// 3. Tag-based: any wiring with matching tag
addMiddleware('api', [rateLimiter])
addPermission('api', { auth: requireAuth })

// 4. Inline: per-wiring
wireHTTP({
  route: '/books/:id',
  func: getBook,
  middleware: [cacheControl],
  permissions: { owner: requireOwnership },
})
```

### Per-Function Permissions

```typescript
export const deleteBook = pikkuFunc({
  func: async ({ db }, { bookId }) => {
    await db.deleteBook(bookId)
  },
  permissions: {
    admin: isAdmin,
    owner: isOwner,
    reviewer: [isAuthenticated, hasBookAccess],
  },
})
```

## Complete Example

```typescript
// permissions.ts
import { pikkuAuth, pikkuPermission } from '#pikku'

export const isAuthenticated = pikkuAuth(
  async (_services, session) => !!session
)

export const isAdmin = pikkuAuth(
  async (_services, session) => session?.role === 'admin'
)

export const isBookOwner = pikkuPermission(
  async ({ db }, { bookId }, { session }) => {
    const book = await db.getBook(bookId)
    return book?.authorId === session?.userId
  }
)

// middleware.ts
import { pikkuMiddleware } from '#pikku'

export const auditLog = pikkuMiddleware(async ({ logger, db }, wire, next) => {
  const start = Date.now()
  await next()
  await db.createAuditLog({
    duration: Date.now() - start,
  })
})

// wirings/security.wiring.ts
import { authBearer } from '@pikku/core/middleware'
import { addHTTPMiddleware, addHTTPPermission } from '#pikku'

// All routes require bearer auth
addHTTPMiddleware('*', [authBearer()])

// Admin routes need admin permission + audit logging
addHTTPMiddleware('/admin/*', [auditLog])
addHTTPPermission('/admin/*', { admin: isAdmin })

// functions/books.functions.ts
export const deleteBook = pikkuFunc({
  title: 'Delete Book',
  func: async ({ db }, { bookId }) => {
    await db.deleteBook(bookId)
    return { deleted: true }
  },
  permissions: {
    admin: isAdmin,
    owner: isBookOwner,
  },
})
```
