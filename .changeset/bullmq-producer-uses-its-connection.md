---
'@pikku/queue-bullmq': patch
---

`BullQueueService` connects its producer to the Redis it was given. It ignored the connection options and used localhost, so a job never reached a Redis anywhere else.
