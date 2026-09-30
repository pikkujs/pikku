---
type: decision
title: A held run is woken later, not retried
description: An orchestrator message that finds its run held enqueues a fresh wake-up a second later instead of failing, because the queue's retry budget is for real failures and a long pass outlasts it
tags: [workflows, leases, queues]
---

# A held run is woken later, not retried

Every message on the orchestrator queue carries news the run has to see — a step
finished, a child ended — so a message that finds the run held by another pass
cannot simply be dropped. Throwing it back to the queue looks equivalent and is
not: it spends the retries the queue keeps for genuine failures. pg-boss gives an
orchestrator message six attempts on an exponential backoff, the last about 55
seconds in; a pass that holds the run longer than that leaves the message dead
and the run `running` forever.

So a `LeaseTakenError` or `LeaseLostError` enqueues a new orchestrator message
with a one-second delay (`RUN_LEASE_RETRY_MS`) and the current message succeeds.
`verifiers/workflows/src/runners/run-lease.runner.ts` holds a run's lease for 90
seconds and checks the run still completes.

The same errors never fail an inline run: its body already wrote its outcome,
and losing the lease afterwards says only that the outcome was not produced
alone — the run keeps the status it wrote.

**What this rules out:** treating a taken run lease as a queue failure, and
marking a run failed because its lease was lost.
