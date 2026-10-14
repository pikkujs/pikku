---
type: decision
title: A persona's schedule starts disabled
description: A virtual-user schedule is written with enabled off unless the caller says otherwise, and only enabled rows come due, so unattended runs need an explicit enable
tags: [virtual-users, schedules, kysely, defaults]
---

# A persona's schedule starts disabled

The `virtualUserSchedule` table gives `enabled` a default of 0 and marks it not null
(`packages/services/kysely/src/schema/virtual-user-schedule.schema.ts:24-27`). The
schema comment says "Off by default, so creating the table spends nothing"
(`virtual-user-schedule.schema.ts:24-26`).

`KyselyVirtualUserScheduleStore.set` resolves the flag as
`schedule.enabled ?? existing?.enabled ?? false`
(`packages/services/kysely/src/kysely-virtual-user-schedule-store.ts:55`). `due()` reads
only rows with `enabled = 1` (`kysely-virtual-user-schedule-store.ts:131`). The store
comment says enabling a schedule "is a deliberate act" (`kysely-virtual-user-schedule-store.ts:70-71`).

**What this rules out:** a persona that runs on its own from the moment its schedule row
is created. Who may write the enabled flag is a separate question, recorded in the Kysely
questions.
