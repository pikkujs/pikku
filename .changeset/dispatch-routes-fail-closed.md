---
'@pikku/node-http-server': patch
---

The `/__pikku/queue-job` and `/__pikku/scheduler-job` dispatch routes now reject
every caller when `dispatchSecret` is unset, instead of accepting anyone. This
matches `@pikku/cloudflare`, which already fails closed on the same header and
the same `PIKKU_DISPATCH_SECRET` value.

**Breaking for anyone relying on the old behaviour:** if you mount
`dispatchJobs: true` without a `dispatchSecret`, dispatch requests that used to
run now return 401. Set `dispatchSecret` to the value your dispatcher sends in
`x-pikku-dispatch`.

The secret comparison also no longer compares lengths first, which leaked the
secret's length through timing.

The remote-rpc templates no longer fall back to a hardcoded
`PIKKU_REMOTE_SECRET`. `start.ts` is the production start script, so that literal
was a published key that could mint a session token as any user. An unset
variable now gets a random per-run secret, and both READMEs document that you
must set it yourself before deploying.
