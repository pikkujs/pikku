import type { CoreAIAgent, AgentRunState } from './ai-agent.types.js'
import { pikkuState } from '../../pikku-state.js'
import type { AIRunStateService } from '../../services/ai-run-state-service.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'

export const addAIAgent = (
  agentName: string,
  agent: CoreAIAgent<any, any>,
  packageName: string | null = null
) => {
  const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
  const agentMeta = agentsMeta[agentName]
  if (!agentMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for AI agent '${agentName}'`
    )
  }
  const agents = pikkuState(packageName, 'agent', 'agents')
  if (agents.has(agentName)) {
    throw new Error(`AI agent already exists: ${agentName}`)
  }
  agents.set(agentName, agent)
}

export async function approveAIAgent(
  aiRunState: AIRunStateService,
  runId: string,
  approvals: { toolCallId: string; approved: boolean }[],
  expectedAgentName?: string
): Promise<{
  status: 'resumed' | 'suspended'
  runId: string
  approved: string[]
  rejected: string[]
  remainingApprovals: number
}> {
  if (!aiRunState) throw new Error('AIRunStateService not available')

  const run = await aiRunState.getRun(runId)
  if (!run) throw new Error('Run not found: ' + runId)
  if (expectedAgentName && run.agentName !== expectedAgentName) {
    throw new Error(
      `Run ${runId} belongs to agent '${run.agentName}', not '${expectedAgentName}'`
    )
  }
  if (run.status !== 'suspended')
    throw new Error('Run is not suspended: ' + run.status)

  const approvedIds = new Set(
    approvals.filter((a) => a.approved).map((a) => a.toolCallId)
  )
  const rejectedIds = new Set(
    approvals.filter((a) => !a.approved).map((a) => a.toolCallId)
  )

  const remaining = (run.pendingApprovals ?? []).filter(
    (p: NonNullable<AgentRunState['pendingApprovals']>[number]) =>
      !approvedIds.has(p.toolCallId) && !rejectedIds.has(p.toolCallId)
  )

  const hasApproved = approvedIds.size > 0
  await aiRunState.updateRun(runId, {
    status: hasApproved ? 'running' : 'suspended',
    pendingApprovals: remaining.length > 0 ? remaining : undefined,
  })

  return {
    status: hasApproved ? 'resumed' : 'suspended',
    runId,
    approved: [...approvedIds],
    rejected: [...rejectedIds],
    remainingApprovals: remaining.length,
  }
}

export const getAIAgents = () => {
  return pikkuState(null, 'agent', 'agents')
}

export const getAIAgentsMeta = () => {
  return pikkuState(null, 'agent', 'agentsMeta')
}
