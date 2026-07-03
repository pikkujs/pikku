/**
 * How an actor agent answers the target agent's tool-approval requests during
 * a conversation.
 * - `'in-persona'` — the actor agent decides as the persona would (default).
 * - `'always'` — approve every request (stress the happy path).
 * - `'never'` — deny every request (exercise refusal handling).
 */
export type ActorFlowApprovalPolicy = 'in-persona' | 'always' | 'never'

/**
 * Options for `actor.converse(...)` — a dynamic conversation an actor holds
 * with a target Pikku AI agent, in the actor's own persona. `TAgentName` is
 * bound to the generated union of agent names in a typed project.
 */
export interface ConverseOptions<TAgentName extends string = string> {
  /** Target Pikku AI agent name to converse with. */
  agent: TAgentName
  /** What the actor is trying to get the agent to accomplish. */
  task: string
  /** Natural-language success criterion the actor evaluates at the end. */
  evaluate: string
  /** How the actor answers the agent's tool-approval requests. Default `'in-persona'`. */
  approvals?: ActorFlowApprovalPolicy
  /** Model the persona uses for its own turns/decisions. Falls back to the actor service default. */
  model?: string
  /** Hard cap on conversation turns before forcing evaluation. Default 12. */
  maxTurns?: number
}

/**
 * The verdict a conversation produces: the persona's LLM self-evaluation of
 * whether the task was met. Deterministic checks are the caller's job — they
 * already hold the actor and can `actor.invoke(...)` afterwards.
 */
export interface ActorFlowVerdict {
  /** Whether the actor judged the task accomplished. */
  passed: boolean
  /** The actor's reasoning for its verdict. */
  reasoning: string
  /** The conversation transcript, for debugging/reporting. */
  transcript: string[]
}

/** A pending tool-approval request surfaced by the target agent. */
export interface TargetPendingApproval {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
}

/** A normalized reply from the target agent, independent of transport. */
export interface TargetAgentReply {
  text: string
  runId: string
  status?: 'completed' | 'suspended'
  pendingApprovals?: TargetPendingApproval[]
}

/**
 * Drives the target agent. In production this is HTTP-backed (the actor's
 * `agentRun` / `agentApprove` calls as the signed-in actor); the conversation
 * engine only sees this transport-agnostic contract.
 */
export interface TargetAgentDriver {
  /** Send a message, starting or continuing the target agent's run. */
  run(message: string): Promise<TargetAgentReply>
  /** Answer the target agent's pending approvals and continue its run. */
  approve(
    runId: string,
    decisions: { toolCallId: string; approved: boolean }[]
  ): Promise<TargetAgentReply>
}
