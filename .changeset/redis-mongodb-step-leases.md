---
'@pikku/redis': patch
'@pikku/mongodb': patch
---

`RedisWorkflowService` and `MongoDBWorkflowService` now record a step's lease, so a step whose worker died is claimed again once the lease lapses, as it already was on Kysely. Both fence a step's result, error and lease renewal to the attempt that claimed it: a superseded worker's write throws `WorkflowStepSupersededError` and leaves the newer attempt's state alone. Redis does the check and the write in one Lua script. MongoDB now keeps the attempt number on the step document, advances it in the same guarded update that grants the lease, and tags every history document with the attempt it belongs to.
