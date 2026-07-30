# Middleware Patterns (extended)

Detailed, less-common middleware recipes. The common-path bearer-auth pattern lives inline in SKILL.md; this file holds the client-side caller, session-setting, and audit recipes.

## Service-to-Service: the client (caller) side

Use the generated `RPCInvoke` type from `.pikku/rpc/pikku-rpc-wirings-map.gen.d.ts` — never hand-write the input/output types:

```typescript
import type { RPCInvoke } from '../../backends/my-service/.pikku/rpc/pikku-rpc-wirings-map.gen.d.js'

export function getServiceRPC(baseUrl: string, token: string): RPCInvoke {
  return async (name: string, data?: unknown) => {
    const res = await fetch(`${baseUrl}/rpc/${String(name)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data: data ?? {} }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`rpc ${String(name)} failed: ${res.status} ${text}`)
    }
    return res.json()
  } as RPCInvoke
}
```

## Session-Setting Middleware

```typescript
const apiKeyAuth = pikkuMiddleware(async ({ kysely }, { http, setSession, session }, next) => {
  if (session) return next()  // already authenticated

  const header = http?.request?.header?.('x-api-key')
  if (!header) return next()

  const row = await kysely.selectFrom('apiKey').select('userId').where('key', '=', header).executeTakeFirst()
  if (row) setSession?.({ userId: row.userId })

  return next()
})

addTagMiddleware('api-key-auth', [apiKeyAuth])
```

Functions tagged `'api-key-auth'` with `auth: true` reject requests without a valid key; those with `auth: false` can inspect the session but won't reject.

## Request Logging / Audit

```typescript
const auditLog = pikkuMiddleware(async ({ logger, db }, wire, next) => {
  const start = Date.now()
  await next()
  await db.createAuditLog({ duration: Date.now() - start })
})

addHTTPMiddleware('/admin/*', [auditLog])
```
