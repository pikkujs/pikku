/**
 * Effect steps for the deterministic agent scenarios.
 *
 * These replace the `I run agent …` family in tests/steps — ten cucumber
 * definitions that differed only in which optional field they bolted on.
 *
 * None of them throws on a non-2xx. A refusal is the expected outcome in twelve
 * of these scenarios, so status is data the assertion steps read.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { randomUUID } from 'node:crypto'
import {
  apiUrlOf,
  postAgent,
  readModelCalls,
  type Identity,
  type MockLlmCall,
} from './agent-transport.js'

export interface AgentRunResult {
  status: number
  ok: boolean
  result: unknown
  error?: string
  /**
   * Every model call this run caused, including any a sub-agent made.
   * Scoped by position in the log, not by message text.
   */
  modelCalls: MockLlmCall[]
  /**
   * The subset whose `userMessage` is this run's own message — what the
   * cucumber `callsFor(message)` filter used to return.
   */
  ownCalls: MockLlmCall[]
}

/**
 * Opens a thread for one scenario.
 *
 * The id is generated inside the step rather than by the scenario body so it
 * is a durable, replay-safe step result instead of nondeterminism in the
 * workflow itself.
 */
export const startsAgentThread = pikkuScenarioStep<void, { threadId: string }>({
  name: 'startsAgentThread',
  description: 'opens a fresh agent thread',
  func: async (_services, _data) => ({ threadId: randomUUID() }),
})

/**
 * Runs an agent through its sync route and returns everything the assertions
 * need, including the model calls the run caused.
 *
 * The call log is scoped by **position** — length before, length after — not by
 * filtering on message text. The cucumber version filtered by `userMessage`,
 * which silently hid every sub-agent call (whose message is the sub-agent's,
 * not this run's). `ownCalls` preserves the old semantics for the assertions
 * that genuinely wanted it.
 */
export const runsAgent = pikkuScenarioStep<
  {
    agent: string
    script: string
    message: string
    threadId: string
    resourceId: string
    identity?: Identity
    context?: string
    temperature?: number
  },
  AgentRunResult
>({
  name: 'runsAgent',
  description: 'runs an agent',
  template: 'runs {agent} with {script}',
  func: async (
    _services,
    {
      agent,
      script,
      message,
      threadId,
      resourceId,
      identity,
      context,
      temperature,
    },
    { scenarioStep }
  ) => {
    const apiUrl = apiUrlOf(scenarioStep.env)
    const before = (await readModelCalls(apiUrl)).length

    const outcome = await postAgent(apiUrl, agent, identity ?? {}, {
      message,
      threadId,
      resourceId,
      model: `mock/${script}`,
      ...(context === undefined ? {} : { context }),
      ...(temperature === undefined ? {} : { temperature }),
    })

    const modelCalls = (await readModelCalls(apiUrl)).slice(before)

    return {
      status: outcome.status,
      ok: outcome.ok,
      result: outcome.body?.result ?? null,
      error: outcome.body?.message ?? outcome.body?.errorId,
      modelCalls,
      ownCalls: modelCalls.filter((call) => call.userMessage === message),
    }
  },
})
