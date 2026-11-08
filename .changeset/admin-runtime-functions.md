---
'@pikku/addon-admin': patch
'@pikku/addon-console': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
---

The workflow-run, agent-thread, webhook-delivery and virtual-user read functions move from `@pikku/addon-console` to `@pikku/addon-admin`, because a deployed stage has those and no console. Call them as `admin:getWorkflowRuns`, `admin:getAgentThreads` and so on, under the new `admin:workflows`, `admin:agents`, `admin:webhooks:deliveries` and `admin:virtualUsers` scopes. `scaffold.console` no longer generates `/workflow-run/:runId/stream`; the new `scaffold.admin` generates the `@pikku/addon-admin` wiring and that route as `ref('admin:streamWorkflowRun')`. `startVirtualUserRun` and `setVirtualUserSchedule` stay in the console because they read the project's meta from disk. `@pikku/better-auth`'s copy of the admin scope tree catches up with the new scopes and the earlier schedules, queues and webhooks
