---
type: question
title: Should every holder of the virtual-user read scope see every virtual user's cadence?
description: getVirtualUserSchedules returns every schedule row the store holds, with no virtual user or per-caller filter, to anyone holding pikku:console:virtualUsers:read
tags: console, virtual-users, scopes
---

# Should every holder of the virtual-user read scope see every virtual user's cadence?

`getVirtualUserSchedules` (`packages/addon/pikku-console/src/functions/get-virtual-user-schedules.function.ts`)
is gated by `pikku:console:virtualUsers:read` (`get-virtual-user-schedules.function.ts:22`).
It calls `virtualUserScheduleStore.list()` with no argument (`:27`) and returns each
row with its dates converted to ISO strings (`:28-32`). Nothing in the function
restricts the result by virtual user or by caller.

The comment says it "returns rows and nothing else", and that the declarations
belong to the meta the console already loads (`get-virtual-user-schedules.function.ts:12-15`).
It does not say whether every reader should see every cadence.

Open: is the full schedule list meant for every holder of the read scope? Run
records and transcripts have a stricter treatment in the same area (see the note on
[virtual-user run reads](../decisions/virtual-user-run-reads-are-privileged-and-row-capped.md)),
and the schedule read does not.
