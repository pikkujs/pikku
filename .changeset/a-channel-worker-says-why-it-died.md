---
'@pikku/cloudflare': patch
---

A channel worker that cannot boot now answers instead of throwing.

The HTTP handler runs `runFetch` with `exposeErrors: true`, so a Worker that fails to start says what went wrong. The channel handler called `setupServices` and dispatched to the Durable Object with neither wrapped, and an uncaught throw in a Worker is a bodiless CF 1101 — no body, no tail, no telemetry, nothing in any log the person who has to fix it can reach. A stage whose WebSocket channels were dead looked exactly like a stage whose channels were not deployed.

Both paths now log the failure and answer 503 with `stage` and a fixed `Channel unavailable`. `stage` separates the router's own boot from everything the hibernation class does, including its own separately-cached boot — a Durable Object binding whose class was never migrated in still resolves and then throws on dispatch, and that is a different fault with a different fix. The reason itself stays in the log: this route is unauthenticated, and a singleton boot failure is usually a service refusing to connect, an error whose message routinely carries the connection string that failed. A client mid-handshake reads the non-101 as a refusal, as it did before.
