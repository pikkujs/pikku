import type { CoreActorFlow, ActorFlowVerdict } from './actor-flow.types.js'
import type { UserFlowActorConfig } from '../../services/user-flow-actors-service.js'
import type { AIMessage, AIAgentOutput } from '../ai-agent/ai-agent.types.js'
import type { RunAIAgentParams } from '../ai-agent/ai-agent-prepare.js'
import { runAIAgent, resumeAIAgentSync } from '../ai-agent/ai-agent-runner.js'
import { randomUUID } from '../ai-agent/ai-agent-utils.js'
import { getSingletonServices } from '../../pikku-state.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'

/**
 * One turn the persona takes: the message it sends to the target agent and
 * whether it considers the task finished.
 */
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

export interface RunActorFlowParams {
  /** The actor flow definition (actor client, target agent, task, evaluate, verify). */
  flow: CoreActorFlow
  /** Persona config (personality/jobTitle/name) that shapes how the actor talks. */
  persona: UserFlowActorConfig
  /** Model the persona (actor agent) uses for its own turns/decisions. */
  model: string
  /** Resource id for the target agent's thread. Defaults to the actor name. */
  resourceId?: string
  /** Thread id for the target agent conversation. Defaults to a fresh uuid. */
  threadId?: string
  /** Hard cap on conversation turns before forcing evaluation. Default 12. */
  maxTurns?: number
  /** Params forwarded to runAIAgent for the target agent (session/credentials). */
  runnerParams?: RunAIAgentParams
}

function msg(role: AIMessage['role'], content: string): AIMessage {
  return { id: randomUUID(), role, content, createdAt: new Date() }
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
  flow: CoreActorFlow,
  persona: UserFlowActorConfig
): string {
  return [
    `You are role-playing a real user interacting with an AI assistant. Stay in character at all times — you are the user, not the assistant.`,
    persona.name ? `Your name is ${persona.name}.` : '',
    persona.jobTitle ? `Your role: ${persona.jobTitle}.` : '',
    persona.personality
      ? `Your personality and communication style: ${persona.personality}. Match this tone, vocabulary, and level of detail exactly.`
      : '',
    `Your goal in this conversation: ${flow.task}.`,
    `Send one message at a time. Set "done" to true only once your goal is clearly accomplished, or clearly impossible.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Route the target agent's pending tool approvals through the persona. */
async function decideApprovals(
  flow: CoreActorFlow,
  persona: UserFlowActorConfig,
  pending: NonNullable<AIAgentOutput['pendingApprovals']>,
  model: string,
  aiAgentRunner: NonNullable<
    ReturnType<typeof getSingletonServices>['aiAgentRunner']
  >
): Promise<{ toolCallId: string; approved: boolean }[]> {
  const policy = flow.approvals ?? 'in-persona'
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

  const result = await aiAgentRunner.run({
    model,
    instructions: `${personaInstructions(flow, persona)}\nThe assistant is asking permission to run tools on your behalf. Decide whether YOU, as this persona, would allow each one.`,
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

/** Drive the target agent to a non-suspended reply, routing approvals to the persona. */
async function converseWithTarget(
  flow: CoreActorFlow,
  persona: UserFlowActorConfig,
  message: string,
  threadId: string,
  resourceId: string,
  model: string,
  runnerParams: RunAIAgentParams,
  aiAgentRunner: NonNullable<
    ReturnType<typeof getSingletonServices>['aiAgentRunner']
  >
): Promise<AIAgentOutput> {
  let output = await runAIAgent(
    flow.agent,
    { message, threadId, resourceId },
    runnerParams
  )

  while (
    output.status === 'suspended' &&
    output.pendingApprovals &&
    output.pendingApprovals.length > 0
  ) {
    const decisions = await decideApprovals(
      flow,
      persona,
      output.pendingApprovals,
      model,
      aiAgentRunner
    )
    output = await resumeAIAgentSync(
      output.runId,
      decisions,
      runnerParams,
      flow.agent
    )
  }

  return output
}

/**
 * Run an actor flow: an LLM-driven persona holds a real conversation with a
 * target Pikku AI agent, approves/denies its tool requests in-persona, then
 * evaluates whether the task was accomplished. A deterministic `verify` hook
 * (if present) runs afterwards and can fail the flow regardless of the LLM
 * verdict.
 */
export async function runActorFlow(
  params: RunActorFlowParams
): Promise<ActorFlowVerdict> {
  const { flow, persona, model } = params
  const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS
  const resourceId = params.resourceId ?? `actor-flow:${flow.actor.name}`
  const threadId = params.threadId ?? randomUUID()
  const runnerParams = params.runnerParams ?? {}

  const { aiAgentRunner } = getSingletonServices()
  if (!aiAgentRunner) {
    throw new AIProviderNotConfiguredError()
  }

  const instructions = personaInstructions(flow, persona)
  const personaMessages: AIMessage[] = []
  const transcript: string[] = []

  for (let turn = 0; turn < maxTurns; turn++) {
    const personaResult = await aiAgentRunner.run({
      model,
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
    transcript.push(`${persona.name ?? 'User'}: ${personaMessage}`)

    const targetOutput = await converseWithTarget(
      flow,
      persona,
      personaMessage,
      threadId,
      resourceId,
      model,
      runnerParams,
      aiAgentRunner
    )

    const reply = targetOutput.text ?? ''
    personaMessages.push(msg('user', reply))
    transcript.push(`${flow.agent}: ${reply}`)

    if (turnData?.done) {
      break
    }
  }

  const evalResult = await aiAgentRunner.run({
    model,
    instructions: `${instructions}\nThe conversation has ended. Judge honestly whether your goal was accomplished.`,
    messages: [
      msg(
        'user',
        `Here is the full conversation:\n\n${transcript.join('\n')}\n\nSuccess criterion: ${flow.evaluate}\n\nWas it met?`
      ),
    ],
    tools: [],
    maxSteps: 1,
    toolChoice: 'none',
    outputSchema: EVALUATION_SCHEMA as unknown as Record<string, unknown>,
  })

  const verdict = readObject<{ passed: boolean; reasoning: string }>(evalResult)
  let passed = verdict?.passed ?? false
  const reasoning = verdict?.reasoning ?? 'No evaluation produced.'
  let verifyError: string | undefined

  if (flow.verify) {
    try {
      await flow.verify({ actor: flow.actor })
    } catch (error) {
      passed = false
      verifyError = error instanceof Error ? error.message : String(error)
    }
  }

  return { passed, reasoning, verifyError }
}
