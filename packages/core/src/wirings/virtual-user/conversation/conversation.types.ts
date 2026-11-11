export type ConversationApprovalPolicy = 'in-virtual-user' | 'always' | 'never'

/**
 * What a scenario asks for when a virtual user holds a conversation with one of the app's agents.
 */
export interface ConverseOptions<TAgentName extends string = string> {
  agent: TAgentName
  /** What the virtual user is trying to get the agent to accomplish. */
  task: string
  /** Natural-language success criterion the virtual user judges the conversation against. */
  evaluate: string
  approvals?: ConversationApprovalPolicy
  model?: string
  maxTurns?: number
}

/** The virtual user's judgement of a conversation, with the transcript it judged. */
export interface ConversationVerdict {
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

/** Transport to the agent under test: sends a message, and answers its tool-approval requests. */
export interface TargetAgentDriver {
  run(message: string): Promise<TargetAgentReply>
  approve(
    runId: string,
    decisions: { toolCallId: string; approved: boolean }[]
  ): Promise<TargetAgentReply>
}
