export type ActorFlowApprovalPolicy = 'in-persona' | 'always' | 'never'

export interface ConverseOptions<TAgentName extends string = string> {
  agent: TAgentName
  /** What the actor is trying to get the agent to accomplish. */
  task: string
  /** Natural-language success criterion the actor judges the conversation against. */
  evaluate: string
  approvals?: ActorFlowApprovalPolicy
  model?: string
  maxTurns?: number
}

export interface ActorFlowVerdict {
  passed: boolean
  reasoning: string
  transcript: string[]
}

export interface TargetPendingApproval {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
}

export interface TargetAgentReply {
  text: string
  runId: string
  status?: 'completed' | 'suspended'
  pendingApprovals?: TargetPendingApproval[]
}

export interface TargetAgentDriver {
  run(message: string): Promise<TargetAgentReply>
  approve(
    runId: string,
    decisions: { toolCallId: string; approved: boolean }[]
  ): Promise<TargetAgentReply>
}
