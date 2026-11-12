import { fetch } from '@pikku/core/http'
import { InMemoryAgentRunStateService } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import { MockAgentRunner, MockAgentStorage } from './agent.assert.js'

/**
 * `/agents/test-agent/approve` is built with `agentApprove('testAgent')`. The
 * session middleware makes the caller `test-user-123`, who owns both runs
 * below, so only the agent a run belongs to can tell them apart.
 */
export async function testAgentApproveScope(
  singletonServices: any
): Promise<boolean> {
  console.log(
    '\n\nTest: agentApprove only approves its own agent, run and live approvals'
  )
  console.log('─────────────────────────')

  const agentRunState = new InMemoryAgentRunStateService()
  pikkuState(null, 'package', 'singletonServices', {
    ...singletonServices,
    agentRunner: new MockAgentRunner(),
    agentRunState,
    agentStorage: new MockAgentStorage(),
  })

  const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000)
  const suspendedRun = (
    agentName: string,
    toolCallId: string,
    expiresAt: Date = inAnHour()
  ) =>
    agentRunState.createRun({
      agentName,
      threadId: `thread-${toolCallId}`,
      resourceId: 'test-user-123',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          type: 'tool-call',
          toolCallId,
          toolName: 'deploy',
          args: {},
          expiresAt,
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

  const approve = (runId: string, toolCallId: string) =>
    fetch(
      new Request('http://localhost/agents/test-agent/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          runId,
          approvals: [{ toolCallId, approved: false }],
        }),
      })
    )

  const otherRunId = await suspendedRun('agentNoAgentMiddleware', 'tc-other')
  const otherResponse = await approve(otherRunId, 'tc-other')
  const otherRun = await agentRunState.getRun(otherRunId)
  const otherRefused =
    otherResponse.status === 403 &&
    otherRun?.status === 'suspended' &&
    otherRun.pendingApprovals?.length === 1
  console.log(
    otherRefused
      ? "✓ Another agent's run was refused (403) and left suspended"
      : `✗ Another agent's run was not refused: status ${otherResponse.status}, run ${otherRun?.status}`
  )

  const ownRunId = await suspendedRun('testAgent', 'tc-own')
  const ownResponse = await approve(ownRunId, 'tc-own')
  const ownRun = await agentRunState.getRun(ownRunId)
  const ownAccepted =
    ownResponse.status === 200 && ownRun?.status === 'completed'
  console.log(
    ownAccepted
      ? "✓ The route's own agent's run was answered (200)"
      : `✗ The route's own agent's run was not answered: status ${ownResponse.status}, run ${ownRun?.status}`
  )

  const foreignRunId = await suspendedRun('testAgent', 'tc-foreign-a')
  await suspendedRun('testAgent', 'tc-foreign-b')
  const foreignResponse = await approve(foreignRunId, 'tc-foreign-b')
  const foreignRun = await agentRunState.getRun(foreignRunId)
  const foreignRefused =
    foreignResponse.status >= 400 &&
    foreignRun?.status === 'suspended' &&
    foreignRun.pendingApprovals?.length === 1
  console.log(
    foreignRefused
      ? '✓ A toolCallId pending on another run was refused and this run left suspended'
      : `✗ A toolCallId from another run was not refused: status ${foreignResponse.status}, run ${foreignRun?.status}`
  )

  const expiredRunId = await suspendedRun(
    'testAgent',
    'tc-expired',
    new Date(Date.now() - 1000)
  )
  const expiredResponse = await approve(expiredRunId, 'tc-expired')
  const expiredRun = await agentRunState.getRun(expiredRunId)
  const expiredRefused =
    expiredResponse.status === 410 &&
    expiredRun?.status === 'failed' &&
    expiredRun.errorMessage === 'approval expired'
  console.log(
    expiredRefused
      ? '✓ An expired approval was refused (410) and the run failed'
      : `✗ An expired approval was not refused: status ${expiredResponse.status}, run ${expiredRun?.status}`
  )

  pikkuState(null, 'package', 'singletonServices', singletonServices)
  return otherRefused && ownAccepted && foreignRefused && expiredRefused
}
