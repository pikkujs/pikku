---
'@pikku/core': patch
---

`InMemoryQueueService` no longer retries a job its worker discarded, matching BullMQ, pg-boss and NATS. The job ends as completed rather than failed.
