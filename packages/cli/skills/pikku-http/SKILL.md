---
name: pikku-http
description: >-
  Use when adding HTTP routes, REST APIs, web endpoints, or SSE streams to a Pikku app. Covers
  wireHTTP, defineHTTPRoutes, route groups, auth, middleware, SSE, and generated
  fetch client. TRIGGER when: code uses wireHTTP/defineHTTPRoutes/wireHTTPRoutes, user asks about
  REST endpoints, API routes, SSE, or the generated fetch client. DO NOT TRIGGER when: user asks
  about WebSocket (use pikku-websocket), queue workers (use pikku-queue), or deployment (use
  pikku-deploy-*).
installGroups: [core]
---

# Pikku HTTP Wiring

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Wire Pikku functions to HTTP endpoints. Supports single routes, composable route groups, auth, middleware, SSE, and auto-generated type-safe clients. (Authorization lives on the function, not the wiring — see `pikku-permissions`.)

## Before You Start

Run these commands to understand the current project:

```bash
pikku info functions --verbose   # See existing functions, their types, tags, middleware
pikku info tags --verbose        # Understand project organization and naming conventions
pikku info middleware --verbose  # See what middleware is already applied
```

Follow existing patterns you find (naming, tag usage, file organization). See `pikku-concepts` for the core mental model.

## API Reference

- `wireHTTP(config)` (from `@pikku/core/http`) — wire one function to one endpoint.
- `defineHTTPRoutes(config)` + `wireHTTPRoutes(config)` (from `.pikku/pikku-types.gen.js`) — group routes with shared config; composable/nestable.

Function input/output types come from the function's own `input:`/`output:` zod schemas — never declared in the wiring. Route `:params`, query params, and body are merged into the function's `data` arg (see Data Flow).

Config cascading across groups: `basePath` concatenates down the chain, `tags` merge (union), `auth` child overrides parent.

For the full option tables (every `wireHTTP` field, the `defineHTTPRoutes`/`wireHTTPRoutes` config shape), read `references/http-options.md`.

### `addHTTPMiddleware(pattern, middlewares)`

```typescript
addHTTPMiddleware('*', [authBearer()]) // All routes
addHTTPMiddleware('/api/*', [rateLimit()]) // Pattern match
```

> HTTP-route-level permissions (`addHTTPPermission`, a `permissions` field on the wiring) were removed in #972. Declare authorization on the function definition (`pikkuFunc({ permissions })`, see `pikku-permissions`), or app-wide via `addGlobalPermission`. Tags/patterns are for _middleware_ only now.

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
    list: { method: 'get', route: '/books', func: listBooks, auth: false }, // per-route override
    get: { method: 'get', route: '/books/:bookId', func: getBook },
    create: { method: 'post', route: '/books', func: createBook },
    delete: { method: 'delete', route: '/books/:bookId', func: deleteBook },
  },
})

const todosRoutes = defineHTTPRoutes({
  auth: false, // group-level default, overridable per-route
  tags: ['todos'],
  routes: {
    list: { method: 'get', route: '/todos', func: listTodos },
  },
})

wireHTTPRoutes({
  basePath: '/api/v1',
  middleware: [cors()],
  routes: { books: booksRoutes, todos: todosRoutes },
})
// Results in: GET /api/v1/books, POST /api/v1/books, GET /api/v1/todos, etc.
```

### Auth

```typescript
// Public route (no auth)
wireHTTP({ method: 'get', route: '/books', func: listBooks, auth: false })

// Authenticated route (default when a global auth middleware is set)
wireHTTP({ method: 'delete', route: '/books/:bookId', func: deleteBook })
```

Authorization is not a wiring concern — declare it on the function via `permissions` (see `pikku-permissions`), or app-wide via `addGlobalPermission`.

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

After `npx pikku all`, a type-safe client is generated:

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

Functions live in their own files (one per file) and supply behavior + `permissions`; the wiring file imports them and wires routes. Sessionless funcs need no session; `pikkuFunc` does.

```typescript
// functions/books.functions.ts
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku'

export const listBooks = pikkuSessionlessFunc({
  title: 'List Books',
  func: async ({ db }, { limit }) => ({ books: await db.listBooks(limit) }),
})

export const getBook = pikkuFunc({
  title: 'Get Book',
  description: 'Retrieve a book by ID',
  func: async ({ db }, { bookId }) => await db.getBook(bookId),
  permissions: { user: isAuthenticated },
})

// wirings/books.http.ts — same defineHTTPRoutes/wireHTTPRoutes shape as the Route Groups example above
import { addHTTPMiddleware } from '@pikku/core/http'
import { cors, authBearer } from '@pikku/core/middleware'

addHTTPMiddleware('*', [cors(), authBearer()])
```
