---
name: pikku-http
description: 'Use when adding HTTP routes, REST APIs, web endpoints, or SSE streams to a Pikku app. Covers wireHTTP, defineHTTPRoutes, route groups, auth, middleware, permissions, SSE, and generated fetch client.'
---

# Pikku HTTP Wiring

Wire Pikku functions to HTTP endpoints. Supports single routes, composable route groups, auth, middleware, permissions, SSE, and auto-generated type-safe clients.

## Before You Start

Run these commands to understand the current project:

```bash
pikku info functions --verbose   # See existing functions, their types, tags, middleware
pikku info tags --verbose        # Understand project organization and naming conventions
pikku info middleware --verbose  # See what middleware is already applied
```

Follow existing patterns you find (naming, tag usage, file organization). See `pikku-concepts` for the core mental model.

## API Reference

### `wireHTTP(config)`

Wire a single function to an HTTP endpoint.

```typescript
import { wireHTTP } from '@pikku/core/http'

wireHTTP({
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head',
  route: string,          // e.g. '/books/:bookId' — :params become data fields
  func: PikkuFunc,        // The function to call
  auth?: boolean,         // Override default auth (true = require session)
  tags?: string[],        // For grouping, middleware targeting
  permissions?: Record<string, PikkuPermission | PikkuPermission[]>,
  middleware?: PikkuMiddleware[],
  sse?: boolean,          // Enable Server-Sent Events
  version?: number,       // API versioning
})
```

### `defineHTTPRoutes(config)` + `wireHTTPRoutes(config)`

Group routes with shared configuration. Groups are composable and nestable.

```typescript
import { defineHTTPRoutes, wireHTTPRoutes } from '.pikku/pikku-types.gen.js'

const routes = defineHTTPRoutes({
  basePath?: string,       // Prepended to all route paths
  tags?: string[],         // Applied to all routes in group
  auth?: boolean,          // Default auth for all routes (overridable per-route)
  middleware?: PikkuMiddleware[],
  routes: {
    [key: string]: {
      method: string,
      route: string,
      func: PikkuFunc,
      auth?: boolean,      // Override group auth
      permissions?: Record<string, PikkuPermission | PikkuPermission[]>,
      middleware?: PikkuMiddleware[],
    }
  }
})

wireHTTPRoutes({
  basePath?: string,       // Top-level prefix (e.g. '/api/v1')
  middleware?: PikkuMiddleware[],
  routes: {
    [key: string]: ReturnType<typeof defineHTTPRoutes>,
  }
})
```

Config cascading rules:

- `basePath` — concatenates down the chain
- `tags` — merge (union)
- `auth` — child overrides parent

### `addHTTPMiddleware(pattern, middlewares)`

```typescript
addHTTPMiddleware('*', [authBearer()]) // All routes
addHTTPMiddleware('/api/*', [rateLimit()]) // Pattern match
```

### `addHTTPPermission(pattern, permissions)`

```typescript
addHTTPPermission('/admin/*', { admin: [isAdmin] })
```

## Data Flow

Pikku merges route params, query params, and request body into a single `data` object:

```typescript
// POST /books/42?format=pdf  with body { title: "New Title" }
wireHTTP({ method: 'post', route: '/books/:bookId', func: updateBook })
// → updateBook receives: { bookId: "42", format: "pdf", title: "New Title" }
```

## Usage Patterns

### Single Route

```typescript
wireHTTP({
  method: 'get',
  route: '/books/:bookId',
  func: getBook,
})
```

### Route Groups (Recommended for CRUD)

```typescript
const booksRoutes = defineHTTPRoutes({
  tags: ['books'],
  routes: {
    list: { method: 'get', route: '/books', func: listBooks, auth: false },
    get: { method: 'get', route: '/books/:bookId', func: getBook },
    create: { method: 'post', route: '/books', func: createBook },
    delete: { method: 'delete', route: '/books/:bookId', func: deleteBook },
  },
})

const todosRoutes = defineHTTPRoutes({
  auth: false,
  tags: ['todos'],
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
    create: { method: 'post', route: '/todos', func: createTodo },
    get: { method: 'get', route: '/todos/:id', func: getTodo },
  },
})

wireHTTPRoutes({
  basePath: '/api/v1',
  middleware: [cors()],
  routes: {
    books: booksRoutes,
    todos: todosRoutes,
  },
})
// Results in: GET /api/v1/books, POST /api/v1/books, etc.
```

### Auth & Permissions

```typescript
// Public route (no auth)
wireHTTP({ method: 'get', route: '/books', func: listBooks, auth: false })

// Route with permission check
wireHTTP({
  method: 'delete',
  route: '/books/:bookId',
  func: deleteBook,
  permissions: { admin: isAdmin },
})

// Pattern-based permissions
addHTTPPermission('/admin/*', { admin: isAdmin })
```

### Middleware

```typescript
import { cors, authBearer } from '@pikku/core/middleware'

// Global middleware
addHTTPMiddleware('*', [
  cors({ origin: 'https://app.example.com', credentials: true }),
  authBearer(),
])

// Scoped middleware
addHTTPMiddleware('/api/*', [rateLimit({ maxRequests: 100, windowMs: 60_000 })])

// Per-route middleware
wireHTTP({
  method: 'delete',
  route: '/books/:bookId',
  func: deleteBook,
  middleware: [auditLog],
})
```

### SSE (Server-Sent Events)

```typescript
wireHTTP({
  method: 'get',
  route: '/todos',
  func: getTodos,
  sse: true,
})

const getTodos = pikkuFunc({
  title: 'Get Todos',
  func: async ({ db, channel }, {}) => {
    const todos = await db.getTodos()

    if (channel) {
      for (const todo of todos) {
        channel.send({ todo })
        await sleep(100)
      }
      return
    }

    return { todos }
  },
})
```

### Generated Fetch Client

After `npx pikku prebuild`, a type-safe client is generated:

```typescript
import { pikkuFetch } from '.pikku/pikku-fetch.gen.js'

pikkuFetch.setServerUrl('http://localhost:4002')

const books = await pikkuFetch.get('/api/v1/books', {})
const book = await pikkuFetch.get('/api/v1/books/:bookId', { bookId: '42' })
const created = await pikkuFetch.post('/api/v1/books', {
  title: 'The Pikku Guide',
  author: 'You',
})

pikkuFetch.setAuthorizationJWT(token)
const deleted = await pikkuFetch.delete('/api/v1/books/:bookId', {
  bookId: created.bookId,
})
```

## Complete Example

```typescript
// functions/books.functions.ts
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku'

export const listBooks = pikkuSessionlessFunc({
  title: 'List Books',
  func: async ({ db }, { limit }) => {
    return { books: await db.listBooks(limit) }
  },
})

export const getBook = pikkuFunc({
  title: 'Get Book',
  description: 'Retrieve a book by ID',
  func: async ({ db }, { bookId }) => {
    return await db.getBook(bookId)
  },
  permissions: { user: isAuthenticated },
})

export const createBook = pikkuFunc({
  title: 'Create Book',
  func: async ({ db }, { title, author }) => {
    return await db.createBook({ title, author })
  },
})

export const deleteBook = pikkuFunc({
  title: 'Delete Book',
  func: async ({ db }, { bookId }) => {
    await db.deleteBook(bookId)
    return { deleted: true }
  },
})

// wirings/books.http.ts
import { defineHTTPRoutes, wireHTTPRoutes } from '.pikku/pikku-types.gen.js'
import { addHTTPMiddleware } from '@pikku/core/http'
import { cors, authBearer } from '@pikku/core/middleware'

const booksRoutes = defineHTTPRoutes({
  tags: ['books'],
  routes: {
    list: { method: 'get', route: '/books', func: listBooks, auth: false },
    get: { method: 'get', route: '/books/:bookId', func: getBook },
    create: { method: 'post', route: '/books', func: createBook },
    delete: { method: 'delete', route: '/books/:bookId', func: deleteBook },
  },
})

wireHTTPRoutes({
  basePath: '/api',
  routes: { books: booksRoutes },
})

addHTTPMiddleware('*', [cors(), authBearer()])
```
