---
'@pikku/cloudflare': patch
---

A channel worker that cannot boot now answers with the reason instead of throwing.

The HTTP handler runs `runFetch` with `exposeErrors: true`, so a Worker that fails to start says what went wrong. The channel handler called `setupServices` and dispatched to the Durable Object with neither wrapped, and an uncaught throw in a Worker is a bodiless CF 1101 — no body, no tail, no telemetry, nothing in any log the person who has to fix it can reach. A stage whose WebSocket channels were dead looked exactly like a stage whose channels were not deployed.

Both paths now report a 503 carrying `stage`, `errorName`, `message` and `stack`, and log the same. `stage` separates the router's own boot from everything the hibernation class does, including its own separately-cached boot, which surfaces as `PikkuChannelServicesError` — a Durable Object binding whose class was never migrated in still resolves and then throws on dispatch, and that is a different fault with a different fix. A client mid-handshake reads the non-101 as a refusal, as it did before.
