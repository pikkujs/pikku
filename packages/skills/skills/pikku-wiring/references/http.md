# Pikku HTTP Wiring

## Contents

- API Reference
- Data Flow
- Usage Patterns
- Complete Example

## API Reference

All three come from `#pikku/http` (the generated `.pikku/http/index.ts`), which
binds them to your project's service, session and middleware types. The
`@pikku/core/http` versions are the unbound generics — they compile, but you
lose the typing that makes the wiring worth having.

- `wireHTTP(config)` — wire one function to one endpoint.
- `defineHTTPRoutes(config)` + `wireHTTPRoutes(config)` — group routes with shared config; composable/nestable.

Function input/output types come from the function's own `input:`/`output:` zod schemas — never declared in the wiring. Route `:params`, query params, and body are merged into the function's `data` arg (see Data Flow).

Config cascading across groups: `basePath` concatenates down the chain, `tags` merge (union), `auth` child overrides parent.

For the full option tables (every `wireHTTP` field, the `defineHTTPRoutes`/`wireHTTPRoutes` config shape), read the HTTP options reference listed in `SKILL.md`.

### `addHTTPMiddleware(pattern, middlewares)`

```typescript
addHTTPMiddleware('*', [authBearer()]) // All routes
addHTTPMiddleware('/api/*', [authBearer()]) // Pattern match
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
import { cors, authBearer } from '#pikku/middleware'

// Global middleware
addHTTPMiddleware('*', [
  cors({ origin: 'https://app.example.com', credentials: true }),
  authBearer(),
])

// Scoped middleware
addHTTPMiddleware('/api/*', [authBearer()])

// Per-route middleware
wireHTTP({
  method: 'delete',
  route: '/books/:bookId',
  func: deleteBook,
  middleware: [auditLog],
})
```

### Rate limits

A rate limit is not middleware: it counts external calls only (HTTP and MCP), so an internal `rpc`, queue or workflow call to the same function is never counted. Set one for every route and tool, and override or exempt per function:

```typescript
import { addGlobalRateLimiter } from '@pikku/core/middleware'

// Every HTTP route and MCP tool, per caller and route
addGlobalRateLimiter({
  limit: 100,
  windowMs: 60_000,
  ipHeader: 'cf-connecting-ip', // the header your proxy sets with the client address
})

// A function's own limit replaces the global one; `false` exempts it
export const submitContact = pikkuSessionlessFunc({
  rateLimit: { limit: 3, windowMs: 60 * 60_000 },
  func: async (services, data) => {
    /* ... */
  },
})
export const health = pikkuSessionlessFunc({ rateLimit: false, func: async () => ({ ok: true }) })
```

- A `rateLimitService` must be in the singleton services (`InMemoryRateLimitService` counts per process; the Kysely and Redis services share counts across instances and restarts). A limit with no service refuses every call with a 500 rather than silently not limiting.
- There is no default `ipHeader`, because a header a client can set is not an address to trust. Without one, every caller shares a bucket per route or tool, and a warning says so. A comma-separated list such as `x-forwarded-for` is read from the right, `trustedProxies` (default 1) entries in, because everything left of your proxy's entry is the client's claim.
- A route can set its own: `wireHTTP({ route, func, rateLimit: false })` wins over the function's. `POST /rpc/:rpcName` applies the called function's own `rateLimit`. The generated `/mesh/rpc/:rpcName` and `/__pikku/*-job` routes are exempt, and any route another unit calls has to be too.
- A refused call answers 429 with `Retry-After` (whole seconds) and `retryAfterMs` in the body, before auth and validation, so a correct call and an incorrect one are refused identically.
- If the store fails the call is refused with 503. Set `onStoreError: 'allow'` to let calls through instead, which turns the limit off while the store is down.


### SSE (Server-Sent Events)

`sse: true` is only accepted on `method: 'get'` — the wiring union offers it on
no other verb.

```typescript
wireHTTP({
  method: 'get',
  route: '/todos',
  func: getTodos,
  sse: true,
})

const getTodos = pikkuFunc({
  title: 'Get Todos',
  func: async ({ db }, {}, { channel }) => {
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

`channel` is on the **wire** — the func's third argument — not on services, and
it is optional because the same function can be reached over plain HTTP or RPC,
where there is no stream to send on. The `if (channel)` guard is what lets one
function serve both; the return value is the non-streaming answer.

A function that throws once the stream is open cannot answer with a status code,
so the runner ends the stream with `{ type: 'error', errorText }` then
`{ type: 'done' }`. A route whose client parses a different event protocol says
so with `streamProtocol`, and the failure is written in that one instead —
`streamProtocol: 'agui'` ends the stream with a single AG-UI `RUN_ERROR` and
nothing after it. The default is `'pikku'`; the generated agent stream routes
set `'agui'`.

### Generated Fetch Client

After `npx pikku all`, a type-safe client is generated:

```typescript
import { pikkuFetch } from '@sdk/api/pikku-fetch.gen.js'

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
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'

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
import { addHTTPMiddleware } from '#pikku/middleware'
import { cors, authBearer } from '#pikku/middleware'

addHTTPMiddleware('*', [cors(), authBearer()])
```
