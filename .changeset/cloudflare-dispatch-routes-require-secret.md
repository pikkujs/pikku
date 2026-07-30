---
'@pikku/cloudflare': patch
---

**Breaking:** the Cloudflare worker's dispatch routes now require `PIKKU_DISPATCH_SECRET`, and reject every request when it is unset.

`POST /__pikku/queue-job` and `POST /__pikku/scheduler-job` are handled ahead of the `includesFetch` gate so a fabric Workers-for-Platforms dispatcher can deliver work to namespace scripts, which cannot bind as CF queue consumers. They had no authentication at all: anyone who could reach the worker URL could run any queue job in the deployment with an attacker-chosen payload, or trigger any scheduled task.

Both routes now require the shared secret in the `x-pikku-dispatch` header, matching the header and env var `@pikku/node-http-server` already uses for the same contract, so one secret covers worker and container dispatch targets. The comparison is a double-HMAC through WebCrypto, which leaks neither the secret's bytes nor its length through timing. A wrong secret and an unconfigured worker both return the same bare 401.

**Every deployment that uses these routes must set `PIKKU_DISPATCH_SECRET`** on the worker (`wrangler secret put PIKKU_DISPATCH_SECRET`) to the value its dispatcher sends. Without it the routes fail closed — queue and scheduler delivery stops — and the worker logs which variable to set. This is deliberate: falling back to unauthenticated execution is what the vulnerability was.
