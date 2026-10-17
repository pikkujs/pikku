import type {
  ConversationApprovalPolicy,
  ConversationVerdict,
  TargetAgentDriver,
  TargetPendingApproval,
} from './conversation.types.js'
import type { ResolvedVirtualUser } from '../../../services/virtual-users-service.js'
import type { AgentMessage } from '../../agent/agent.types.js'
import type {
  AgentRunnerParams,
  AgentStepResult,
} from '../../../services/agent-runner-service.js'

/** One turn the virtual user takes: the message to send and whether it's finished. */
const VIRTUAL_USER_TURN_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    done: { type: 'boolean' },
  },
  required: ['message', 'done'],
} as const

/** The virtual user's approve/deny decision for each pending tool request. */
const APPROVAL_DECISION_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          toolCallId: { type: 'string' },
          approved: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['toolCallId', 'approved'],
      },
    },
  },
  required: ['decisions'],
} as const

/** The virtual user's final verdict on whether the task was accomplished. */
const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['passed', 'reasoning'],
} as const

const DEFAULT_MAX_TURNS = 12

const DEFAULT_MAX_APPROVAL_ROUNDS = 16

/** The LLM call the virtual user uses for its own turns/decisions/evaluation. */
export type VirtualUserLLM = (
  params: AgentRunnerParams
) => Promise<AgentStepResult>

/** What `runConversation` needs to play one virtual user against one agent. */
export interface RunConversationParams {
  /** The person being played — name, job title, personality. */
  virtualUser: ResolvedVirtualUser
  /** The id they were declared under (for transcript labelling). */
  virtualUserId: string
  /** What the virtual user is trying to get the target agent to accomplish. */
  task: string
  /** Natural-language success criterion the virtual user evaluates at the end. */
  evaluate: string
  /** How the virtual user answers the target agent's tool-approval requests. */
  approvals?: ConversationApprovalPolicy
  /** Model the virtual user uses for its own turns/decisions. */
  model: string
  /** Hard cap on conversation turns. Default 12. */
  maxTurns?: number
  /** Hard cap on tool-approval rounds within a single target turn. Default 16. */
  maxApprovalRounds?: number
  /** Transport that drives the target agent (HTTP in production). */
  target: TargetAgentDriver
  /** The virtual user's own LLM. */
  llm: VirtualUserLLM
  /** Display name of the target agent (transcript labelling). */
  agentName: string
}

function msg(role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id: globalThis.crypto.randomUUID(),
    role,
    content,
    createdAt: new Date(),
  }
}

/** Read a structured `run` result, falling back to parsing JSON from text. */
export function readObject<T>(result: {
  object?: unknown
  text?: string
}): T | null {
  if (result.object && typeof result.object === 'object') {
    return result.object as T
  }
  if (result.text) {
    try {
      return JSON.parse(result.text) as T
    } catch {
      return null
    }
  }
  return null
}

function virtualUserConversationInstructions(
  virtualUser: ResolvedVirtualUser,
  task: string
): string {
  return [
    `You are role-playing a real user interacting with an AI assistant. Stay in character at all times — you are the user, not the assistant.`,
    `Your name is ${virtualUser.name}.`,
    virtualUser.jobTitle ? `Your role: ${virtualUser.jobTitle}.` : '',
    virtualUser.personality
      ? `Your personality and communication style: ${virtualUser.personality}. Match this tone, vocabulary, and level of detail exactly.`
      : '',
    `Your goal in this conversation: ${task}.`,
    `Send one message at a time. Set "done" to true only once your goal is clearly accomplished, or clearly impossible.`,
    // knowledge: decisions/internals/the-virtual-user-prompt-says-json-because-of-json-object-mode.md
    `Reply with json matching the schema you are given, and nothing else.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Route the target agent's pending tool approvals through the virtual user. */
async function decideApprovals(
  params: RunConversationParams,
  instructions: string,
  pending: TargetPendingApproval[]
): Promise<{ toolCallId: string; approved: boolean }[]> {
  const policy = params.approvals ?? 'in-virtual-user'
  if (policy === 'always') {
    return pending.map((p) => ({ toolCallId: p.toolCallId, approved: true }))
  }
  if (policy === 'never') {
    return pending.map((p) => ({ toolCallId: p.toolCallId, approved: false }))
  }

  const summary = pending
    .map(
      (p) =>
        `- toolCallId "${p.toolCallId}": ${p.toolName}(${JSON.stringify(p.args)})${p.reason ? ` — ${p.reason}` : ''}`
    )
    .join('\n')

  const result = await params.llm({
    model: params.model,
    instructions: `${instructions}\nThe assistant is asking permission to run tools on your behalf. Decide whether YOU, as this virtual user, would allow each one.`,
    messages: [
      msg(
        'user',
        `The assistant wants to run these tools:\n${summary}\nApprove or deny each toolCallId.`
      ),
    ],
    tools: [],
    maxSteps: 1,
    toolChoice: 'none',
    outputSchema: APPROVAL_DECISION_SCHEMA as unknown as Record<
      string,
      unknown
    >,
  })

  const decided =
    readObject<{
      decisions?: { toolCallId: string; approved: boolean }[]
    }>(result)?.decisions ?? []

  // Every pending call must get a decision; a missing one defaults to denied.
  return pending.map((p) => {
    const match = decided.find((d) => d.toolCallId === p.toolCallId)
    return { toolCallId: p.toolCallId, approved: match?.approved ?? false }
  })
}

/** Drive the target to a non-suspended reply, routing approvals to the virtual user. */
async function converseWithTarget(
  params: RunConversationParams,
  instructions: string,
  message: string
) {
  const maxRounds = params.maxApprovalRounds ?? DEFAULT_MAX_APPROVAL_ROUNDS
  let reply = await params.target.run(message)
  let rounds = 0
  while (
    reply.status === 'suspended' &&
    reply.pendingApprovals &&
    reply.pendingApprovals.length > 0
  ) {
    if (rounds >= maxRounds) {
      throw new Error(
        `Target agent "${params.agentName}" stayed suspended after ${maxRounds} approval rounds (runId ${reply.runId}); aborting to avoid an unbounded approve loop.`
      )
    }
    rounds++
    const decisions = await decideApprovals(
      params,
      instructions,
      reply.pendingApprovals
    )
    reply = await params.target.approve(reply.runId, decisions)
  }
  return reply
}

/**
 * Run a conversation: an LLM-driven virtual user holds a real multi-turn exchange
 * with a target agent (driven via the injected transport), answers the target's
 * tool-approval requests in-virtual-user, then evaluates whether the task was met.
 * Deterministic checks are the caller's responsibility.
 */
export async function runConversation(
  params: RunConversationParams
): Promise<ConversationVerdict> {
  const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS
  const instructions = virtualUserConversationInstructions(
    params.virtualUser,
    params.task
  )
  // Seed a kickoff so the very first virtual user turn has a non-empty message list
  // (providers reject an empty prompt). It's an instruction TO the virtual user, so
  // it never appears in the transcript.
  const virtualUserMessages: AgentMessage[] = [
    msg(
      'user',
      'Begin the conversation now — send your first message to the assistant to work towards your goal.'
    ),
  ]
  const transcript: string[] = []

  for (let turn = 0; turn < maxTurns; turn++) {
    const virtualUserResult = await params.llm({
      model: params.model,
      instructions,
      messages: virtualUserMessages,
      tools: [],
      maxSteps: 1,
      toolChoice: 'none',
      outputSchema: VIRTUAL_USER_TURN_SCHEMA as unknown as Record<
        string,
        unknown
      >,
    })

    const turnData = readObject<{ message: string; done: boolean }>(
      virtualUserResult
    )
    const virtualUserMessage = turnData?.message?.trim()
    if (!virtualUserMessage) {
      break
    }

    virtualUserMessages.push(msg('assistant', virtualUserMessage))
    transcript.push(`${params.virtualUser.name}: ${virtualUserMessage}`)

    const reply = await converseWithTarget(
      params,
      instructions,
      virtualUserMessage
    )
    virtualUserMessages.push(msg('user', reply.text ?? ''))
    transcript.push(`${params.agentName}: ${reply.text ?? ''}`)

    if (turnData?.done) {
      break
    }
  }

  const evalResult = await params.llm({
    model: params.model,
    instructions: `${instructions}\nThe conversation has ended. Judge honestly whether your goal was accomplished.`,
    messages: [
      msg(
        'user',
        `Here is the full conversation:\n\n${transcript.join('\n')}\n\nSuccess criterion: ${params.evaluate}\n\nWas it met?`
      ),
    ],
    tools: [],
    maxSteps: 1,
    toolChoice: 'none',
    outputSchema: EVALUATION_SCHEMA as unknown as Record<string, unknown>,
  })

  const verdict = readObject<{ passed: boolean; reasoning: string }>(evalResult)
  return {
    passed: verdict?.passed ?? false,
    reasoning: verdict?.reasoning ?? 'No evaluation produced.',
    transcript,
  }
}
