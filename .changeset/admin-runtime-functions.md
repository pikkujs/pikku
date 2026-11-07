---
'@pikku/addon-admin': minor
'@pikku/addon-console': minor
'@pikku/better-auth': patch
'@pikku/cli': minor
---

The workflow-run, agent-thread, webhook-delivery and virtual-user read functions move from `@pikku/addon-console` to `@pikku/addon-admin`, because a deployed stage has those and no console. Call them as `admin:getWorkflowRuns`, `admin:getAgentThreads` and so on, under the new `admin:workflows`, `admin:agents`, `admin:webhooks:deliveries` and `admin:virtualUsers` scopes. `scaffold.console` no longer generates `/workflow-run/:runId/stream`: wire `ref('admin:streamWorkflowRun')` yourself. `startVirtualUserRun` and `setVirtualUserSchedule` stay in the console because they read the project's meta from disk. `@pikku/better-auth`'s copy of the admin scope tree catches up with the new scopes and the earlier schedules, queues and webhooks
