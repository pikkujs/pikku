---
'@pikku/inspector': patch
---

Inspector now captures the `deploy: 'serverless' | 'server' | 'auto'` option
from `pikkuFunc` / `pikkuSessionlessFunc` calls, alongside the other runtime
metadata (`expose`, `remote`, `mcp`, `readonly`, `approvalRequired`).

Previously this field was defined on `FunctionRuntimeMeta` but never read
from the user's source, so `deploy: 'server'` was silently dropped. That
left downstream consumers — notably `@pikku/cli`'s deployment analyzer,
which routes server-targeted functions to a container unit — treating
every function as `serverless` regardless of its declared intent.
