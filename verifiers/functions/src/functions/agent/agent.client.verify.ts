/**
 * Type-level verification for the generated agent client and `usePikkuAgent`.
 * This file is checked by `tsc --noEmit` — it must compile without errors.
 * It is NOT executed at runtime.
 */

import { usePikkuAgent } from '@pikku/react'
import type { PikkuAgentEvent } from '@pikku/fetch'
import { pikkuRPC } from '#pikku/pikku-rpc.gen.js'
import '#pikku/pikku-react-query.gen.js'

const input = { message: 'hi', threadId: 't1', resourceId: 'r1' }

export const verifyAgentClient = async () => {
  const reply = await pikkuRPC.agent.run('agentMinimal', input)
  const runId: string = reply.runId
  if (reply.status === 'suspended') {
    // Narrowed: a suspended run always lists what it is waiting on.
    const { toolCallId, toolName } = reply.pendingApprovals[0]!
    const resumed = await pikkuRPC.agent.approve('agentMinimal', {
      runId,
      approvals: [{ toolCallId, approved: toolName.length > 0 }],
    })
    const stillSuspended: 'suspended' | undefined = resumed.status
    void stillSuspended
  } else {
    // @ts-expect-error — a finished run has no pending approvals to read
    reply.pendingApprovals[0]
  }

  // @ts-expect-error — not an agent
  await pikkuRPC.agent.run('notAnAgent', input)

  // @ts-expect-error — the input needs a threadId
  await pikkuRPC.agent.run('agentMinimal', { message: 'hi', resourceId: 'r1' })

  for await (const event of pikkuRPC.agent.stream('agentMinimal', input, {
    signal: new AbortController().signal,
  })) {
    const typed: PikkuAgentEvent = event
    if (event.type === 'TEXT_MESSAGE_CONTENT') {
      const delta: string = event.delta
      void delta
    }
    if (event.type === 'CUSTOM' && event.name === 'pikku:approval-request') {
      const approvalRunId: string = event.value.runId
      void approvalRunId
    }
    void typed
  }

  // @ts-expect-error — stream is an async iterable, not a promise of a result
  // oxlint-disable-next-line typescript/await-thenable -- deliberate type test
  const notAResult: { result: unknown } = await pikkuRPC.agent.stream(
    'agentMinimal',
    input
  )
  void notAResult
}

export const useVerifyAgentHook = () => {
  const agent = usePikkuAgent('agentWithPersonality')

  // @ts-expect-error — the generated React Query file registers the app's agents
  usePikkuAgent('notAnAgent')

  return async () => {
    const reply = await agent.run(input)
    if (reply.status === 'suspended') {
      await agent.approve({
        runId: reply.runId,
        approvals: reply.pendingApprovals.map(({ toolCallId }) => ({
          toolCallId,
          approved: true,
        })),
      })
    }
    let text = ''
    for await (const event of agent.stream(input)) {
      if (event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta
    }
    return text
  }
}
