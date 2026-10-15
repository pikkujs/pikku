---
type: question
title: Should the security-audit child process inherit the whole server environment?
description: spawnProcess gives the pikku audit child a copy of every environment variable of the server, and the function that starts it is gated only by pikku:console:security:run; no comment says the full environment is needed
tags: console, security-audit, environment
---

# Should the security-audit child process inherit the whole server environment?

`spawnProcess` (`packages/addon/pikku-console/src/lib/audit-exec.ts:41-55`) starts
its child with `env: { ...process.env }` (`audit-exec.ts:53`). The child is the
`pikku audit --outdated` run that `runPikkuAudit` starts (`audit-exec.ts:87-93`).
`spawnProcess` has no comment on the environment, and only states that `pikku audit`
exits non-zero when it finds advisories (`audit-exec.ts:38-40`).

The caller is `runSecurityAudit` (`packages/addon/pikku-console/src/functions/run-security-audit.function.ts`),
which calls `runPikkuAudit` at `run-security-audit.function.ts:20`. It is gated by
`pikku:console:security:run` (`run-security-audit.function.ts:11`).

Open: does the audit child need every variable the server holds, or only a
subset? The code gives the child all of them. This note does not check what the
server's environment contains when deployed.
