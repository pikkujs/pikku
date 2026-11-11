---
type: decision
title: Virtual-user scheduled ticks are left unwired and run as pikku-platform
description: The scaffold splits virtual-user scopes into run, read and schedule, and its scheduled tick runs under the platform user's session with virtualUser:run, found through @pikku/better-auth, but nothing wires the tick
tags: cli, virtual-user, scheduling, auth
---

# Virtual-user scheduled ticks are left unwired and run as pikku-platform

`serializeVirtualUserFunctions` in
`packages/cli/src/functions/wirings/virtual-user/serialize-virtual-user-functions.ts`
declares three scopes under `virtualUser`: `run`, `read` and `schedule`
(`serialize-virtual-user-functions.ts:309-321`). Starting a run takes `virtualUser:run`
(`serialize-virtual-user-functions.ts:329`). Reading runs and schedules takes
`virtualUser:read` (`serialize-virtual-user-functions.ts:394`, `:415`, `:436`, `:478`).
Writing a schedule takes `virtualUser:schedule` (`serialize-virtual-user-functions.ts:457`).
The comment says a schedule spends money repeatedly with nobody present, which is why it
has its own scope (`serialize-virtual-user-functions.ts:454-456`).

The tick runs as the platform user. `virtualUserPlatformSession` sets that user with
`virtualUser:run` (`serialize-virtual-user-functions.ts:524-532`). The tick then dispatches
through `runVirtualUser`, so the same gate applies (`serialize-virtual-user-functions.ts:574-580`).

**The platform user is found through `@pikku/better-auth`, which the scaffold depends on.**
`pikku-platform` is only the id the row is asked for: under `uuid` or `serial` ids
better-auth assigns its own, so `platformUserId` looks the row up by its reserved address
with `findPlatformUserId` and falls back to `pikku-platform` only while the row does not
exist, or when the app has no `auth` service (`serialize-virtual-user-functions.ts:514-522`).
The generated file therefore imports `@pikku/better-auth` unconditionally
(`serialize-virtual-user-functions.ts:284`), and the command declares it in the package that
owns the generated file with `ensurePackageDependency`, the way a generated channel client
declares `@pikku/websocket`. There is no second form of the middleware for apps without it:
the sign-in plugin, the provisioning and the platform user are all better-auth's, and a branch
that hid that only made the generated code differ by project.

The tick is not wired. The comment says pikku does not start a timer on an application's
behalf, and gives a `wireScheduler` snippet for the person to add when they mean it
(`serialize-virtual-user-functions.ts:534-561`). `tickVirtualUserSchedules` is declared
at `serialize-virtual-user-functions.ts:562` with no wiring call.

**What this rules out:** a scaffold that starts spending model budget on its own after
`pikku all`, a scheduled run that runs under a person's session, and a scaffold that
generates for a project without `@pikku/better-auth`.
