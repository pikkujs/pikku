---
'@pikku/core': patch
---

Record the calls a function makes across a boundary as spans. A queue `add` is a `producer` span `queue.publish <queue>`, `scheduleRPC` is `scheduler.schedule` and a webhook `send` is `webhook.send`, each with `messaging.system` and `messaging.destination.name`; the job carries the producer span's `traceparent`, so the consumer is its child. A call through the `DeploymentService` is a `client` span `rpc.call <name>` with `rpc.service`. A workflow step's span is a `consumer` with `pikku.workflow.run_id` and `pikku.workflow.step`. Nothing is recorded without a tracer or on an unsampled trace, and no payload, argument or URL is ever an attribute.
