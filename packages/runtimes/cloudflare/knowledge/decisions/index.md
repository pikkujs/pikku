---
type: overview
title: Decisions
description: Rules chosen in runtimes/cloudflare, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [The unauthenticated channel boot-failure route answers only a stage](channel-boot-failure-answers-only-the-stage.md) — When a channel fails to boot, the unauthenticated response names the failing stage and keeps the error text in the log
- [Job routes refuse without a matching dispatch secret](job-routes-refuse-without-a-matching-dispatch-secret.md) — The Cloudflare queue-job and scheduler-job routes fail closed when PIKKU_DISPATCH_SECRET is unset, and compare the header in constant time
- [A websocket connect that throws closes with 1008 and a generic 403, and the fault is logged](websocket-connect-faults-close-1008-with-a-generic-403.md) — The hibernation websocket server treats any throw from channel connect as a denial to the client, logs the detail, and returns no error text
<!-- /pikku:knowledge-index -->
