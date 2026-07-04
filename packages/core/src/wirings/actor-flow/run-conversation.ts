import type {
  ActorFlowApprovalPolicy,
  ActorFlowVerdict,
  TargetAgentDriver,
  TargetPendingApproval,
} from './actor-flow.types.js'
import type { ScenarioActorConfig } from '../../services/scenario-actors-service.js'
import type { AIMessage } from '../ai-agent/ai-agent.types.js'
import type {
  AIAgentRunnerParams,
  AIAgentStepResult,
} from '../../services/ai-agent-runner-service.js'

/** One turn the persona takes: the message to send and whether it's finished. */
const PERSONA_TURN_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    done: { type: 'boolean' },
  },
  required: ['message', 'done'],
} as const

/** The persona's approve/deny decision for each pending tool request. */
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

/** The persona's final verdict on whether the task was accomplished. */
const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['passed', 'reasoning'],
} as const

const DEFAULT_MAX_TURNS = 12

/**
 * Hard cap on suspend→approve rounds within a single target turn. A cooperative
 * target completes after a handful of tool-approval rounds; a buggy or
 * uncooperative one (e.g. re-requesting a tool the persona keeps denying) could
 * otherwise keep the loop spinning forever inside one turn, never spending a
 * `maxTurns` credit.
 */
const DEFAULT_MAX_APPROVAL_ROUNDS = 16

/** The LLM call the persona uses for its own turns/decisions/evaluation. */
export type PersonaLLM = (
  params: AIAgentRunnerParams
) => Promise<AIAgentStepResult>

export interface RunConversationParams {
  /** Persona config (personality/jobTitle/name) that shapes how the actor talks. */
  persona: ScenarioActorConfig
  /** Stable persona name (for transcript labelling). */
  personaName: string
  /** What the actor is trying to get the target agent to accomplish. */
  task: string
  /** Natural-language success criterion the actor evaluates at the end. */
  evaluate: string
  /** How the actor answers the target agent's tool-approval requests. */
  approvals?: ActorFlowApprovalPolicy
  /** Model the persona uses for its own turns/decisions. */
  model: string
  /** Hard cap on conversation turns. Default 12. */
  maxTurns?: number
  /** Hard cap on tool-approval rounds within a single target turn. Default 16. */
  maxApprovalRounds?: number
  /** Transport that drives the target agent (HTTP in production). */
  target: TargetAgentDriver
  /** The persona's own LLM. */
  llm: PersonaLLM
  /** Display name of the target agent (transcript labelling). */
  agentName: string
}

function msg(role: AIMessage['role'], content: string): AIMessage {
  return {
    id: globalThis.crypto.randomUUID(),
    role,
    content,
    createdAt: new Date(),
  }
}

/** Read a structured `run` result, falling back to parsing JSON from text. */
function readObject<T>(result: { object?: unknown; text?: string }): T | null {
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

function personaInstructions(
  persona: ScenarioActorConfig,
  task: string
): string {
  return [
    `You are role-playing a real user interacting with an AI assistant. Stay in character at all times — you are the user, not the assistant.`,
    persona.name ? `Your name is ${persona.name}.` : '',
    persona.jobTitle ? `Your role: ${persona.jobTitle}.` : '',
    persona.personality
      ? `Your personality and communication style: ${persona.personality}. Match this tone, vocabulary, and level of detail exactly.`
      : '',
    `Your goal in this conversation: ${task}.`,
    `Send one message at a time. Set "done" to true only once your goal is clearly accomplished, or clearly impossible.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Route the target agent's pending tool approvals through the persona. */
async function decideApprovals(
  params: RunConversationParams,
  instructions: string,
  pending: TargetPendingApproval[]
): Promise<{ toolCallId: string; approved: boolean }[]> {
  const policy = params.approvals ?? 'in-persona'
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
    instructions: `${instructions}\nThe assistant is asking permission to run tools on your behalf. Decide whether YOU, as this persona, would allow each one.`,
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

/** Drive the target to a non-suspended reply, routing approvals to the persona. */
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
 * Run a conversation: an LLM-driven persona holds a real multi-turn exchange
 * with a target agent (driven via the injected transport), answers the target's
 * tool-approval requests in-persona, then evaluates whether the task was met.
 * Deterministic checks are the caller's responsibility.
 */
export async function runConversation(
  params: RunConversationParams
): Promise<ActorFlowVerdict> {
  const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS
  const instructions = personaInstructions(params.persona, params.task)
  // Seed a kickoff so the very first persona turn has a non-empty message list
  // (providers reject an empty prompt). It's an instruction TO the persona, so
  // it never appears in the transcript.
  const personaMessages: AIMessage[] = [
    msg(
      'user',
      'Begin the conversation now — send your first message to the assistant to work towards your goal.'
    ),
  ]
  const transcript: string[] = []

  for (let turn = 0; turn < maxTurns; turn++) {
    const personaResult = await params.llm({
      model: params.model,
      instructions,
      messages: personaMessages,
      tools: [],
      maxSteps: 1,
      toolChoice: 'none',
      outputSchema: PERSONA_TURN_SCHEMA as unknown as Record<string, unknown>,
    })

    const turnData = readObject<{ message: string; done: boolean }>(
      personaResult
    )
    const personaMessage = turnData?.message?.trim()
    if (!personaMessage) {
      break
    }

    personaMessages.push(msg('assistant', personaMessage))
    transcript.push(`${params.personaName}: ${personaMessage}`)

    const reply = await converseWithTarget(params, instructions, personaMessage)
    personaMessages.push(msg('user', reply.text ?? ''))
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
