/**
 * The events `POST /rpc/agent/:agentName/stream` sends, in the AG-UI protocol.
 * `@pikku/core`'s `wrapChannelWithAGUI` writes them; these are the shapes it writes.
 */

/** Token usage for a run, one entry per model. */
export type PikkuAgentUsage = {
  model?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** A tool call the agent may not make until the user approves it. Answer it with `approve`. */
export type PikkuAgentApprovalRequest = {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
  runId: string
  agent?: string
  session?: string
}

/** A tool call that needs the user to connect a credential first. */
export type PikkuAgentCredentialRequest = {
  toolCallId: string
  toolName: string
  args: unknown
  credentialName: string
  credentialType?: string
  connectUrl?: string
  runId: string
  agent?: string
  session?: string
}

/** The `CUSTOM` events Pikku sends, by name. */
export type PikkuAgentCustomEvent =
  | {
      type: 'CUSTOM'
      name: 'pikku:approval-request'
      value: PikkuAgentApprovalRequest
    }
  | {
      type: 'CUSTOM'
      name: 'pikku:credential-request'
      value: PikkuAgentCredentialRequest
    }
  | { type: 'CUSTOM'; name: 'pikku:generative-ui'; value: { spec: unknown } }
  | {
      type: 'CUSTOM'
      name: 'pikku:data'
      value: { name: string; data: unknown }
    }
  | {
      type: 'CUSTOM'
      name: 'pikku:agent-call'
      value: { agentName: string; session?: string; input: unknown }
    }
  | {
      type: 'CUSTOM'
      name: 'pikku:agent-result'
      value: { agentName: string; session?: string; result: unknown }
    }
  | {
      type: 'CUSTOM'
      name: 'pikku:suspended'
      value: { reason: string; missingRpcs?: string[] }
    }
  | {
      type: 'CUSTOM'
      name: 'pikku:interrupted'
      value: { runId: string; text?: string; reason?: string }
    }
  | {
      type: 'CUSTOM'
      name: 'pikku:audio-delta'
      value: { data: string; format: string; text?: string }
    }
  | { type: 'CUSTOM'; name: 'pikku:audio-done'; value: {} }
  | { type: 'CUSTOM'; name: 'pikku:transcript'; value: { text: string } }

/**
 * One event of an agent stream. Narrow on `type`, then on `name` for `CUSTOM`:
 * `TEXT_MESSAGE_CONTENT` carries the reply text as `delta`s, a `CUSTOM` named
 * `pikku:approval-request` asks for an approval, and `RUN_FINISHED` is always last.
 * `RUN_ERROR` is never yielded: it is thrown as a `PikkuAgentStreamError`.
 */
export type PikkuAgentEvent =
  | { type: 'RUN_STARTED'; threadId: string; runId: string }
  | {
      type: 'RUN_FINISHED'
      threadId: string
      runId: string
      usage?: PikkuAgentUsage[]
    }
  | { type: 'TEXT_MESSAGE_START'; messageId: string }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string; toolCallName: string }
  | {
      type: 'TOOL_CALL_RESULT'
      messageId: string
      toolCallId: string
      role: 'tool'
      content: string
    }
  | { type: 'THINKING_START' }
  | { type: 'THINKING_TEXT_MESSAGE_START'; messageId: string }
  | { type: 'THINKING_TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'THINKING_TEXT_MESSAGE_END'; messageId: string }
  | { type: 'THINKING_END' }
  | { type: 'STEP_STARTED'; stepName: string }
  | { type: 'STEP_FINISHED'; stepName: string }
  | PikkuAgentCustomEvent

/** Options for reading an agent stream. */
export type PikkuAgentStreamOptions = {
  /** Aborting it ends the request; the loop reading the stream then throws an `AbortError`. */
  signal?: AbortSignal
}

/** Thrown when an agent stream reports `RUN_ERROR`, or ends before `RUN_FINISHED`. */
export class PikkuAgentStreamError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'PikkuAgentStreamError'
  }
}

/** What a turn sends: the user's message, the conversation it belongs to, and who it is for. */
export type PikkuAgentInput = {
  message: string
  /** One id per conversation; reuse it and the agent reads that thread's earlier messages. */
  threadId: string
  /** Any stable label; the server files it under the signed-in user. */
  resourceId: string
  attachments?: Array<{
    type: 'image' | 'file'
    data?: string
    url?: string
    mediaType?: string
    filename?: string
  }>
  model?: string
  temperature?: number
  context?: string
}

/** A tool call waiting for the user's approval, as `run` and `approve` return it. */
export type PikkuAgentPendingApproval = {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
  runId: string
}

/** One decision per pending tool call of a suspended run. */
export type PikkuAgentApproveInput = {
  runId: string
  approvals: { toolCallId: string; approved: boolean }[]
}

/**
 * What `run` and `approve` resolve to. A run that stopped for approval has
 * `status: 'suspended'` and the calls waiting in `pendingApprovals`.
 */
export type PikkuAgentRunResult<Output = unknown> = {
  runId: string
  result: Output
  usage: { inputTokens: number; outputTokens: number }
} & (
  | { status?: undefined; pendingApprovals?: undefined }
  | { status: 'suspended'; pendingApprovals: PikkuAgentPendingApproval[] }
)
