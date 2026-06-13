---
'@pikku/cli': patch
'@pikku/cucumber': patch
---

Add `pikku tests init` command that scaffolds a Cucumber function-test harness in the functions package. Extract reusable harness infrastructure (StubTracker, world, hooks, common steps, db utils) into a new `@pikku/cucumber` package. The generated harness wires real Pikku RPC dispatch against an in-process SQLite copy seeded from migrations, with stubbed services via Proxy.
