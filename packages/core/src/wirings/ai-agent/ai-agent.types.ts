import type {
  CorePermissionGroup,
  CorePikkuPermission,
} from '../../function/functions.types.js'
import type {
  CorePikkuMiddleware,
  MiddlewareMetadata,
  PermissionMetadata,
} from '../../types/core.types.js'
import type { AIProviderOptions } from '../../services/ai-agent-runner-service.js'
import type { PikkuChannel } from '../channel/channel.types.js'
import type { CorePikkuChannelMiddleware } from '../channel/channel.types.js'
import type { ApprovalPolicy } from '../channel/channel-rpc.js'

export interface AIThread {
  id: string
  resourceId: string
  title?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data?: string; url?: string; mediaType?: string }
  | {
      type: 'file'
      data?: string
      url?: string
      mediaType: string
      filename?: string
    }
  | {
      type: 'data'
      name: string
      data: unknown
    }
  | {
      type: 'generative-ui'
      spec: unknown
    }

export interface AIToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface AIToolResult {
  id: string
  name: string
  result: string
}

export interface AIMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | AIContentPart[]
  toolCalls?: AIToolCall[]
  toolResults?: AIToolResult[]
  reasoningContent?: string
  /**
   * Set on an assistant message whose generation was cut short by
   * an interrupt — the text is a mid-sentence fragment, not a reply.
   * Carried into the next turn's context so the model can see it said only
   * this much before being talked over, and decide for itself whether to
   * resume, restate or move on. Storage that drops unknown fields loses the
   * marker but keeps the fragment, which degrades to a truncated reply.
   */
  interrupted?: boolean
  /**
   * Set on a tool message whose result arrived after the run was interrupted,
   * so the model never got to describe it. The work happened; only the reply
   * about it was lost. It is ordinary thread context on the next turn — the
   * model raises it unprompted ("that deploy did go through") rather than the
   * result being silently dropped or replayed as a fresh tool call.
   */
  undelivered?: boolean
  createdAt: Date
}

export interface AIAgentStep {
  usage: { inputTokens: number; outputTokens: number }
  toolCalls?: { name: string; args: Record<string, unknown>; result: string }[]
}

export interface AIAgentInputAttachment {
  type: 'image' | 'file'
  data?: string
  url?: string
  mediaType?: string
  filename?: string
}

export interface AIAgentInput {
  message: string
  threadId: string
  resourceId: string
  attachments?: AIAgentInputAttachment[]
  model?: string
  temperature?: number
  /** Structured context injected into the system instructions for this request.
   *  Use to provide upfront state (e.g. current org/project/branch/deployment)
   *  so the agent can call tools without asking the user for identifiers. */
  context?: string
}

export interface AIAgentOutput {
  runId: string
  text: string
  object?: unknown
  threadId: string
  steps: AIAgentStep[]
  usage: { inputTokens: number; outputTokens: number }
  status?: 'completed' | 'suspended'
  pendingApprovals?: Array<{
    toolCallId: string
    toolName: string
    args: unknown
    reason?: string
    runId: string
  }>
}

/**
 * How an agent's threads/runs are owned and partitioned.
 * - `'user'` (default): owner is the authenticated `session.userId`; the caller's
 *   `resourceId` becomes a sub-partition within that user (`userId:resourceId`).
 * - `'org'`: owner is the authenticated `session.orgId` (`orgId:resourceId`), so
 *   threads are shared across everyone in the org. Requires a session with an org
 *   (e.g. Better Auth's `organization` plugin) — otherwise access is denied.
 *
 * The trusted principal is always the prefix, so a client-supplied `resourceId`
 * can sub-divide within the caller's own boundary but can never widen access to
 * another user's or org's threads.
 */
export type SessionScope = 'user' | 'org'

/**
 * `ApprovalPolicy` is shared with channel capabilities, but `Partial` here:
 * absent `needsApproval` means "do not ask", which is safe because a tool is
 * written by whoever runs the server it executes on. A capability runs on
 * someone else's machine, so it requires the field instead.
 */
export interface AIAgentToolDef extends Partial<ApprovalPolicy> {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: unknown) => Promise<unknown>
  /**
   * Mirrors the pikku function's `readonly` flag. A read that gets interrupted
   * is discarded rather than reported: nothing changed, and by the next turn
   * the data may be stale anyway — re-reading is cheaper than explaining a
   * result the user never asked to hear about.
   */
  readonly?: boolean
  /**
   * Set only by the framework on sub-agent delegating tools. Such a tool may
   * legitimately return an `__approvalRequired` marker to forward a nested
   * sub-agent approval. The marker is honored ONLY from a tool with this flag —
   * a plain tool's output (which an attacker may influence) can never forge an
   * approval request. See `checkForApprovals`.
   */
  forwardsApproval?: boolean
}

export interface PikkuAIMiddlewareHooks<
  State extends Record<string, unknown> = Record<string, unknown>,
  Services = any,
> {
  modifyInput?: (
    services: Services,
    ctx: {
      messages: AIMessage[]
      instructions: string
      /**
       * Notes about this run that every middleware can read and write, as
       * opposed to {@link modifyOutputStream}'s `state`, which is private to
       * one middleware.
       *
       * It exists because middlewares transform the turn for each other, and
       * the transformation can destroy what a later one needed to know. Voice
       * is the case in point: `voiceInput` replaces the user's audio with its
       * transcript, so by the time anything downstream looks, the turn is
       * indistinguishable from one that was typed — and whether it was typed is
       * exactly what `voiceOutput` needs in order to decide whether to answer
       * aloud. Only the middleware that consumed the audio can still say so.
       *
       * Namespace what you put here (`voice:spokenTurn`); it is one bag for
       * everybody. Cleared between runs.
       */
      shared: Record<string, unknown>
    }
  ) =>
    | Promise<{ messages: AIMessage[]; instructions: string }>
    | { messages: AIMessage[]; instructions: string }

  modifyOutputStream?: (
    services: Services,
    ctx: {
      event: AIStreamEvent
      allEvents: readonly AIStreamEvent[]
      /** Private to this middleware, for this run. Cross-middleware facts go in `shared`. */
      state: State
      /** Per-run notes shared with every middleware — see {@link modifyInput}. */
      shared: Record<string, unknown>
      /**
       * Push an event into the stream *after* this call has returned.
       *
       * Returning events blocks the stream until the hook resolves, which is
       * right for anything derived from the event and wrong for anything slow.
       * Speech is the motivating case: awaiting a text-to-speech call before
       * returning the text delta stalls the reader at every full stop and
       * serialises synthesis behind playback. Return the text immediately,
       * start the slow work, and `emit` its result when it lands.
       *
       * Ordering among emitted events is the caller's problem — chain them if
       * it matters — and a hook that emits must make sure anything still
       * outstanding has landed before it lets `done` through.
       */
      emit: (event: AIStreamEvent) => Promise<void>
      /**
       * Aborts when the run is interrupted. Pass it to any provider call the
       * hook makes: work started for a reply the user has already talked over
       * is billed but never heard.
       */
      signal?: AbortSignal
    }
  ) =>
    | Promise<AIStreamEvent | AIStreamEvent[] | null>
    | AIStreamEvent
    | AIStreamEvent[]
    | null

  modifyOutput?: (
    services: Services,
    ctx: {
      text: string
      messages: AIMessage[]
      usage: { inputTokens: number; outputTokens: number }
    }
  ) =>
    | Promise<{ text: string; messages: AIMessage[] }>
    | { text: string; messages: AIMessage[] }

  beforeToolCall?: (
    services: Services,
    ctx: {
      toolName: string
      toolCallId: string
      args: Record<string, unknown>
    }
  ) =>
    | Promise<{ args: Record<string, unknown> } | void>
    | { args: Record<string, unknown> }
    | void

  afterToolCall?: (
    services: Services,
    ctx: {
      toolName: string
      toolCallId: string
      args: Record<string, unknown>
      result: unknown
      durationMs: number
    }
  ) => Promise<{ result: unknown } | void> | { result: unknown } | void

  afterStep?: (
    services: Services,
    ctx: {
      stepNumber: number
      text: string
      toolCalls: { toolCallId: string; toolName: string; args: unknown }[]
      toolResults: { toolCallId: string; toolName: string; result: unknown }[]
      usage: { inputTokens: number; outputTokens: number }
      finishReason: string
    }
  ) => Promise<void> | void

  onError?: (
    services: Services,
    ctx: {
      error: Error
      stepNumber: number
      messages: AIMessage[]
    }
  ) => Promise<void> | void
}

export type AIAgentMemoryConfig = {
  storage?: string
  vector?: string
  embedder?: string
  lastMessages?: number
  workingMemory?: unknown
}

export type CoreAIAgent<
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
  Scope extends string = string,
> = {
  name: string
  description: string
  summary?: string
  errors?: string[]
  /**
   * The three fields below are the system prompt. `buildInstructions` joins
   * whichever are set with a blank line, always in this order — role, then
   * personality, then goal — and appends the tool-usage rules if the agent has
   * tools. Nothing checks them against each other: the split is there to keep a
   * prompt legible, and text put in the wrong one still reaches the model.
   *
   * Who the agent is. 'You are a support engineer triaging inbound bugs.'
   */
  role?: string
  /** How it should sound: tone, vocabulary, how much it says at a time. */
  personality?: string
  /** What it is for — the only one of the three that is required. */
  goal: string
  model: string
  temperature?: number
  /** Ownership/partitioning of this agent's threads and runs. Defaults to `'user'`. */
  sessionScope?: SessionScope
  tools?: unknown[]
  agents?: unknown[]
  workflows?: unknown[]
  agentMode?: 'delegate' | 'supervise'
  memory?: AIAgentMemoryConfig
  maxSteps?: number
  toolChoice?: 'auto' | 'required' | 'none'
  /**
   * Per-provider model settings, keyed by provider id and passed through
   * untouched — for anything only one vendor offers, which the fields above
   * deliberately do not try to unify.
   *
   * `{ openai: { reasoningEffort: 'minimal' } }` is the one that matters for
   * voice: on gpt-5-mini it measured 0.9s to first token against 2.5s at the
   * default, and a spoken reply is waited through rather than skimmed.
   */
  providerOptions?: AIProviderOptions
  input?: unknown
  output?: unknown
  tags?: string[]
  prepareStep?: (ctx: {
    stepNumber: number
    messages: AIMessage[]
    tools: AIAgentToolDef[]
    toolChoice: 'auto' | 'required' | 'none'
    model: string
    stop: () => void
  }) => void | Promise<void>
  middleware?: PikkuMiddleware[]
  channelMiddleware?: CorePikkuChannelMiddleware<any, any>[]
  aiMiddleware?: PikkuAIMiddlewareHooks<any, any>[]
  /**
   * Whether a session is required to run this agent. Defaults to `false`, since
   * agents are commonly invoked from an already-authenticated `pikkuFunc` or
   * from genuinely sessionless contexts (crons, queue workers). Set `true` to
   * require a session at the agent itself. `scopes` and `permissions` are
   * enforced either way.
   */
  auth?: boolean
  /**
   * Scopes the session must hold to run this agent. All of them are required
   * (AND), and they are checked before `permissions` — unlike permissions,
   * which OR together, a scope can only narrow access.
   *
   * Narrowed to the generated `ScopeId` union in a project's own
   * `pikku-types.gen.ts`, so an undeclared scope is a compile error.
   */
  scopes?: Scope[]
  permissions?: CorePermissionGroup<PikkuPermission>
}

export type AIStreamEvent =
  | { type: 'step-start'; stepNumber: number; agent?: string; session?: string }
  | { type: 'text-delta'; text: string; agent?: string; session?: string }
  | { type: 'reasoning-delta'; text: string; agent?: string; session?: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'tool-result'
      toolCallId: string
      toolName: string
      result: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'agent-call'
      agentName: string
      session: string
      input: unknown
    }
  | {
      type: 'agent-result'
      agentName: string
      session: string
      result: unknown
    }
  | {
      type: 'approval-request'
      toolCallId: string
      toolName: string
      args: unknown
      reason?: string
      runId?: string
      agent?: string
      session?: string
    }
  | {
      type: 'credential-request'
      toolCallId: string
      toolName: string
      args: unknown
      credentialName: string
      credentialType: 'oauth2' | 'apikey'
      connectUrl?: string
      runId: string
      agent?: string
      session?: string
    }
  | {
      type: 'usage'
      tokens: { input: number; output: number }
      model: string
      agent?: string
      session?: string
    }
  | { type: 'error'; message: string; agent?: string; session?: string }
  | {
      type: 'audio-delta'
      data: string
      format: string
      /**
       * The sentence this audio says.
       *
       * Carried alongside the bytes because a client that gets talked over has
       * to tell the model what the user actually heard, and playback position
       * is the only place that is knowable. Without it a barge-in can stop the
       * sound but not report it, and the next turn is answered as though the
       * whole reply had landed.
       */
      text?: string
      agent?: string
      session?: string
    }
  | { type: 'audio-done'; agent?: string; session?: string }
  | {
      /**
       * What the user was heard to say, sent once at the start of a spoken
       * turn. Only the server knows this — the client sent audio — and a chat
       * surface needs it to show the user's own message.
       */
      type: 'transcript'
      text: string
      agent?: string
      session?: string
    }
  | {
      type: 'data'
      name: string
      data: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'generative-ui'
      spec: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'suspended'
      reason: 'rpc-missing'
      missingRpcs: string[]
    }
  | {
      type: 'interrupted'
      runId: string
      /** The truncated assistant text at the moment generation stopped. */
      text: string
      reason: 'speech' | 'user' | 'timeout'
      agent?: string
      session?: string
    }
  | { type: 'done' }

export interface AIStreamChannel extends PikkuChannel<unknown, AIStreamEvent> {}

export type PendingApproval =
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: unknown
    }
  | {
      type: 'agent-call'
      toolCallId: string
      agentName: string
      agentRunId: string
      displayToolName: string
      displayArgs: unknown
    }
  | {
      type: 'credential-request'
      toolCallId: string
      toolName: string
      args: unknown
      credentialName: string
      credentialType: 'oauth2' | 'apikey'
      connectUrl?: string
    }

export interface AgentRunState {
  runId: string
  agentName: string
  threadId: string
  resourceId: string
  status: 'running' | 'suspended' | 'completed' | 'failed' | 'interrupted'
  errorMessage?: string
  suspendReason?: 'approval' | 'credential' | 'rpc-missing'
  missingRpcs?: string[]
  pendingApprovals?: PendingApproval[]
  usage: { inputTokens: number; outputTokens: number; model: string }
  createdAt: Date
  updatedAt: Date
}

export interface AgentRunRow {
  runId: string
  agentName: string
  threadId: string
  resourceId: string
  status: string
  errorMessage?: string
  suspendReason?: string
  missingRpcs?: string[]
  usageInputTokens: number
  usageOutputTokens: number
  usageModel: string
  createdAt: Date
  updatedAt: Date
}

export interface AgentRunService {
  listThreads(options?: {
    agentName?: string
    resourceId?: string
    /**
     * Restrict results to threads owned by one of these session principals. A
     * thread matches when its `resourceId` is the principal itself or one of its
     * `principal:` sub-partitions, mirroring the composition
     * `resolveOwnerResourceId` writes.
     *
     * Unlike `resourceId`, which is an optional exact-match filter, this is an
     * authorization constraint: an empty array matches nothing. Callers exposing
     * threads over the wire must derive it from the session, never from input.
     */
    owners?: string[]
    limit?: number
    offset?: number
  }): Promise<AIThread[]>
  getThread(threadId: string): Promise<AIThread | null>
  getThreadMessages(threadId: string): Promise<AIMessage[]>
  getThreadRuns(threadId: string): Promise<AgentRunRow[]>
  deleteThread(threadId: string): Promise<boolean>
  getDistinctAgentNames(): Promise<string[]>
}

export type AIAgentMeta = Record<
  string,
  Omit<
    CoreAIAgent,
    | 'input'
    | 'output'
    | 'tools'
    | 'agents'
    | 'workflows'
    | 'middleware'
    | 'channelMiddleware'
    | 'aiMiddleware'
    | 'permissions'
  > & {
    tools?: string[]
    agents?: string[]
    workflows?: string[]
    inputSchema: string | null
    outputSchema: string | null
    workingMemorySchema: string | null
    middleware?: MiddlewareMetadata[]
    channelMiddleware?: MiddlewareMetadata[]
    aiMiddleware?: MiddlewareMetadata[]
    permissions?: PermissionMetadata[]
    sourceFile?: string
    exportedName?: string
  }
>
