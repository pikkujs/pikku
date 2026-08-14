---
type: decision
title: The AG-UI bridge obeys the client's event-ordering contract exactly
description: RUN_STARTED opens lazily, RUN_FINISHED fires once on done, and step names are globally sequential — a violation makes the client drop the whole stream
tags: agent
---

# The AG-UI bridge obeys the client's event-ordering contract exactly

`wrapChannelWithAGUI` in `packages/core/src/wirings/agent/agent-agui.ts`
translates pikku stream events into AG-UI events under three rules that
`@ag-ui/client`'s `verifyEvents` enforces on the browser side:

`RUN_STARTED` is emitted lazily, from the first translated event, because the
client rejects anything that arrives before it — and because the real
`AgentRunStateService` run id only exists after the channel has been wrapped, which
is why `AGUIChannelOptions.getRunId` and `StreamAgentOptions.onRunCreated`
exist as late-bound sources. `RUN_FINISHED` is terminal for the client, so it is
sent exactly once, on `done`, carrying usage accumulated across all steps; per-step
`usage` events must not finish the run, or a multi-step tool run would emit later
steps after the terminal event and the client would drop the whole stream.
Step names must be unique among active steps, and sub-agents reuse step numbers
on the shared channel, so each `step-start` closes the previous step and takes a
sequential name. `agent-agui.test.ts` re-implements those ordering rules so
the bridge is checked against the same contract the browser applies.

**What this rules out:** emitting `RUN_STARTED` eagerly at wrap time; finishing
the run on the `usage` event so token counts arrive earlier; and naming AG-UI
steps after `event.stepNumber`.
