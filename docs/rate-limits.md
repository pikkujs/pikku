# Rate limits

A rate limit caps how many **external** calls a caller can make in a window. It applies to HTTP routes and MCP tools. An internal call (`rpc`, a queue job, a workflow step) is never counted, so a function that fans out to others costs its caller one hit.

## Setting a limit

```typescript
import { addGlobalRateLimiter } from '@pikku/core/middleware'

addGlobalRateLimiter({
  limit: 100,
  windowMs: 60_000,
  ipHeader: 'cf-connecting-ip',
})
```

Every HTTP route and MCP tool is counted per caller and per route (or tool). A function can replace the limit, or opt out:

```typescript
export const submitContact = pikkuSessionlessFunc({
  rateLimit: { limit: 3, windowMs: 60 * 60_000 },
  func: async (services, data) => {
    /* ... */
  },
})

export const health = pikkuSessionlessFunc({
  rateLimit: false,
  func: async () => ({ ok: true }),
})
```

A function's own `rateLimit` **replaces** the global limit; it does not add to it.

## Who the caller is

`ipHeader` names the request header your proxy sets with the client address, such as `cf-connecting-ip` or `x-forwarded-for` (the first entry is used).

There is no default, because a header the client can set is not an address to trust. Without `ipHeader` every caller shares one bucket per route or tool, and a warning says so. For an MCP call with no HTTP request behind it, the caller is the session's user when there is one, and one shared bucket otherwise.

## Where the counts live

Add a `rateLimitService` to the singleton services:

| Service                                                           | Counts are                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `InMemoryRateLimitService` (`@pikku/core/services`)               | per process, and gone on restart                           |
| `KyselyRateLimitService` (`@pikku/kysely`)                        | in the `pikku_rate_limit` table, shared and durable        |
| `PgKyselyRateLimitService`, `MySQLKyselyRateLimitService`         | as Kysely's, with windows judged on the database clock     |
| `RedisRateLimitService` (`@pikku/redis`)                          | in Redis, shared and durable, with the key TTL as the window |

A limit with no `rateLimitService` answers every call with a 500, so a missing service is never mistaken for a limit that works. Use a shared store whenever more than one instance serves traffic.

On Cloudflare Workers, use `KyselyRateLimitService` over D1. Workers KV is eventually consistent, so a counter kept in it loses hits under concurrency.

## What a refused call looks like

- HTTP answers `429` with a `Retry-After` header in whole seconds, and `retryAfterMs` in the body. MCP answers with error code `-32000`.
- The check runs before authentication and validation, so a call that would have failed is refused exactly as one that would have succeeded.
- A refused call is not counted, so a caller that keeps going cannot hold a full window open.
- If the store cannot be reached the call is refused with `503`. Set `onStoreError: 'allow'` to let calls through instead, which turns the limit off while the store is down.

## Writing a store

A store implements one method. It has to count and compare in a single atomic step, so concurrent hits never admit more than the limit:

```typescript
interface RateLimitService {
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
}
```

The window opens at a key's first hit after the previous window ended. `defineServiceTests` from `@pikku/core/testing` runs the shared conformance suite against it.
