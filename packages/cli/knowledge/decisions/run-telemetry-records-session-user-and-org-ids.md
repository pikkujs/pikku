---
type: decision
title: Run telemetry writes the session user and org ids on every wire
description: The outer telemetry middleware writes tenantuserid and tenantorgid from the wire session on every request it times
tags: cli, telemetry, tenancy
---

# Run telemetry writes the session user and org ids on every wire

The outer telemetry middleware in `packages/cli/src/utils/run-telemetry.ts` wraps every wire. It reads the
session with `field(wire, 'session')` (`run-telemetry.ts:143`), and in its `finally` block writes a
`telemetry` record (`run-telemetry.ts:145-158`).

The record includes `tenantuserid: text(session?.userId)` and `tenantorgid: text(session?.orgId)`
(`run-telemetry.ts:154-155`). These are written whatever the outcome, since the write is in `finally`
(`run-telemetry.ts:141`).

**What this rules out:** a telemetry sink that omits the tenant ids. Each record names the user and org of
the session that made the call.
