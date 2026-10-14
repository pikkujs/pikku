---
type: decision
title: The remote job inbox is auth-false, guarded by a secret that fails closed
description: The generated /__pikku/queue-job and /__pikku/scheduler-job routes skip pikku auth and rely on remoteJobsSecret, which rejects every call when the secret is unset
tags: cli, remote-jobs, auth, security
---

# The remote job inbox is auth-false, guarded by a secret that fails closed

`serializeRemoteJobs` in `packages/cli/src/functions/wirings/remote-jobs/serialize-remote-jobs.ts`
generates two POST routes, `/__pikku/queue-job` and `/__pikku/scheduler-job`
(`serialize-remote-jobs.ts:68-83`). Both are `auth: false` (`serialize-remote-jobs.ts:52`,
`serialize-remote-jobs.ts:60`, `serialize-remote-jobs.ts:70`, `serialize-remote-jobs.ts:79`).
The generator's comment says the secret check is middleware, so a deployment can put
its own scheme in front of it (`serialize-remote-jobs.ts:12-14`).

Both routes carry `middleware: [remoteJobsSecret]` (`serialize-remote-jobs.ts:73`,
`serialize-remote-jobs.ts:82`).

`remoteJobsSecret` in `packages/core/src/middleware/remote-jobs-secret.ts` throws
`UnauthorizedError` unless the expected secret is set and the header matches. The
comparison is constant-time (`packages/core/src/middleware/remote-jobs-secret.ts:8-15`).
The fail-closed rule is stated in its comment (`remote-jobs-secret.ts:17-21`) and
enforced at `remote-jobs-secret.ts:26-31`.

**What this rules out:** an inbox that runs jobs when the deployment forgot to set a
secret, and a route that relies on pikku's session auth, which a dispatcher does not carry.
