# wireHTTP / defineHTTPRoutes / wireHTTPRoutes — full option reference

## `wireHTTP(config)`

Wire a single function to an HTTP endpoint. Import from `#pikku`.

| Option         | Type                                                                     | Notes                                                                    |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `method`       | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete' \| 'head' \| 'options'` | HTTP verb                                                                |
| `route`        | `string`                                                                 | e.g. `/books/:bookId` — `:params` become `data` fields                   |
| `func`         | `PikkuFunc`                                                              | The function to call                                                     |
| `auth?`        | `boolean`                                                                | Override default auth (`true` = require session)                         |
| `tags?`        | `string[]`                                                               | For grouping, middleware targeting                                       |
| `middleware?`  | `PikkuMiddleware[]`                                                      | Per-route middleware                                                     |
| `sse?`         | `boolean`                                                                | Enable Server-Sent Events — **`method: 'get'` only**                     |
| `query?`       | `Array<keyof In>`                                                        | **`method: 'post'` only** — input fields also read from the query string |
| `contentType?` | `'xml' \| 'json'`                                                        | Response content type                                                    |
| `timeout?`     | `number`                                                                 | Request timeout in ms                                                    |
| `headers?`     | `HTTPHeadersSchema`                                                      | Expected headers schema                                                  |

`sse` and `query` are constrained by the config union rather than by a runtime
check, so a `sse: true` on a `post` fails to typecheck rather than silently
serving a normal response. OpenAPI metadata is not declared here — it is derived
from the function's `description`/`summary` and its input/output schemas.

## `defineHTTPRoutes(config)` + `wireHTTPRoutes(config)`

Group routes with shared configuration. Groups are composable and nestable. Import from `#pikku`.

```typescript
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
