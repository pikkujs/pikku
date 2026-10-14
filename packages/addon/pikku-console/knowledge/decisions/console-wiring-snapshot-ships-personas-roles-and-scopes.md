---
type: decision
title: The console wiring snapshot carries personas, system roles and scope trees, and the addon filter does not narrow them
description: AllMeta includes personas, systemRoles and scopes; get-all-meta returns them under pikku:console:wirings:read, and filterAllMetaByAddon narrows the wiring lists but spreads these three fields through unchanged
tags: console, wiring, meta, scopes
---

# The console wiring snapshot carries personas, system roles and scope trees, and the addon filter does not narrow them

`PikkuMetaState` (`packages/addon/pikku-console/src/services/wiring.service.ts:265`)
declares `personas` (`wiring.service.ts:277`), `systemRoles` (`wiring.service.ts:285`)
and `scopes` (`wiring.service.ts:291`). `AllMeta` extends it
(`wiring.service.ts:316`), so the snapshot carries all three.

The comments give the reason. Roles ship with personas "because a persona only ever
names roles, and nothing about what they can reach is readable without the scopes
each one confers" (`wiring.service.ts:281-284`). The scope trees are keyed by root
and say whether the app, a CLI-generated file or an installed addon declared them
(`wiring.service.ts:286-290`).

`get-all-meta.function.ts` is gated by `pikku:console:wirings:read`
(`get-all-meta.function.ts:11`). It returns `filterAllMetaByAddon(...)` on the
`readAllMeta()` result, narrowed by the optional `addon` input
(`get-all-meta.function.ts:13`).

`filterAllMetaByAddon` returns the snapshot unchanged when no addon is given
(`wiring.service.ts:325`). With an addon it narrows the MCP, channel, queue,
scheduler, RPC, workflow, trigger, agent and outgoing-webhook lists
(`wiring.service.ts:330-339`). It then returns `...meta` (`wiring.service.ts:344`),
so `personas`, `systemRoles` and `scopes` pass through whatever addon is asked for.

**What this rules out:** moving these three fields to a different gate while they
remain in the snapshot served under `pikku:console:wirings:read`, and assuming the
addon filter limits them to one addon.
