---
'@pikku/node-http-server': patch
'@pikku/deploy-cloudflare': patch
---

feat(node-http-server): dispatch cron + queue jobs into the server-target container

A `deploy: 'server'` unit runs in a long-lived Node container and is never
uploaded as a CF script, so its scheduled tasks and queue workers previously
had no way to fire — dispatch only reached CF scripts. `PikkuNodeHTTPServer`
now mounts two authenticated dispatch routes when `dispatchJobs` is enabled:
`POST /__pikku/scheduler-job` (`runScheduledTask`) and `POST /__pikku/queue-job`
(`runQueueJob`), gated by a `dispatchSecret` checked with `timingSafeEqual`
against an `x-pikku-dispatch` header. The cloudflare adapter's generated server
entry now passes `{ dispatchJobs: true, dispatchSecret: process.env.PIKKU_DISPATCH_SECRET }`,
so a fabric proxy can forward `/__pikku/*` dispatch to the container exactly
like it forwards HTTP — one dispatch primitive for both runtimes.
