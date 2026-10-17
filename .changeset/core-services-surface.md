---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
'@pikku/skills': patch
---

**Breaking:** `@pikku/core/services` no longer re-exports the in-memory implementations of a wire, so importing it stops loading the workflow, queue, trigger and gateway runtimes (102 modules down to 40). Each implementation now has its own subpath, and the remote job runners moved to the wire they run:

| Export                        | Was                    | Now                                       |
| ----------------------------- | ---------------------- | ----------------------------------------- |
| `InMemoryWorkflowService`     | `@pikku/core/services` | `@pikku/core/services/in-memory-workflow` |
| `InMemoryQueueService`        | `@pikku/core/services` | `@pikku/core/services/in-memory-queue`    |
| `InMemoryTriggerService`      | `@pikku/core/services` | `@pikku/core/services/in-memory-trigger`  |
| `LocalGatewayService`         | `@pikku/core/services` | `@pikku/core/services/local-gateway`      |
| `pikkuRemoteQueueJobFunc`     | `@pikku/core/services` | `@pikku/core/queue`                       |
| `pikkuRemoteScheduledJobFunc` | `@pikku/core/services` | `@pikku/core/scheduler`                   |

```diff
-import { ConsoleLogger, InMemoryTriggerService } from '@pikku/core/services'
+import { ConsoleLogger } from '@pikku/core/services'
+import { InMemoryTriggerService } from '@pikku/core/services/in-memory-trigger'
```

The `REMOTE_*` constants and the `RemoteQueueJobData`/`RemoteScheduledJobData` types stay on `@pikku/core/services`. `@pikku/core/middleware` no longer loads the queue and scheduler runners through `remoteJobsSecret` (50 modules down to 23).

Core also has no runtime import cycles left: the rpc runner and an agent's sub-agent tools reach the runners that call them lazily, and `wirings-stay-decoupled.test.ts` now fails on any module cycle, on a new cycle between areas, on code outside `wirings/` reaching a wire it is not declared to, and on `@pikku/core/services` loading wire runtime or more than 45 modules.

The CLI's generated local services and remote job inbox, and the standalone deploy entry, import from the new paths.
