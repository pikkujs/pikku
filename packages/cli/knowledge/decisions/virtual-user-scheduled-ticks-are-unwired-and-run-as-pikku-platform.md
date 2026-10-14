---
type: decision
title: Virtual-user scheduled ticks are left unwired and run as pikku-platform
description: The scaffold splits virtual-user scopes into run, read and schedule, and its scheduled tick runs under a pikku-platform session with virtualUser:run, but nothing wires the tick
tags: cli, virtual-user, scheduling, auth
---

# Virtual-user scheduled ticks are left unwired and run as pikku-platform

`serializeVirtualUserFunctions` in
`packages/cli/src/functions/wirings/virtual-user/serialize-virtual-user-functions.ts`
declares three scopes under `virtualUser`: `run`, `read` and `schedule`
(`serialize-virtual-user-functions.ts:319-331`). Starting a run takes `virtualUser:run`
(`serialize-virtual-user-functions.ts:339`). Reading runs and schedules takes
`virtualUser:read` (`serialize-virtual-user-functions.ts:429`, `serialize-virtual-user-functions.ts:492`).
Writing a schedule takes `virtualUser:schedule` (`serialize-virtual-user-functions.ts:471`).
The comment says a schedule spends money repeatedly with nobody present, which is why it
has its own scope (`serialize-virtual-user-functions.ts:468-470`).

The tick runs as `pikku-platform`. `virtualUserPlatformSession` sets that user with
`virtualUser:run` (`serialize-virtual-user-functions.ts:525-535`). The tick then dispatches
through `runVirtualUser`, so the same gate applies (`serialize-virtual-user-functions.ts:554-559`).

The tick is not wired. The comment says pikku does not start a timer on an application's
behalf, and gives a `wireScheduler` snippet for the person to add when they mean it
(`serialize-virtual-user-functions.ts:537-552`). `tickVirtualUserSchedules` is declared
at `serialize-virtual-user-functions.ts:565` with no wiring call.

**What this rules out:** a scaffold that starts spending model budget on its own after
`pikku all`, and a scheduled run that runs under a person's session.
