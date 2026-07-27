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
  postAgentApproval,
  postRpc,
  readModelCalls,
  type Identity,
  type MockLlmCall,
} from './agent-transport.js'

/** One tool call the run is waiting on a human decision for. */
export interface PendingApproval {
  toolCallId: string
  toolName: string
  reason: string
}

export interface AgentRunResult {
  status: number
  ok: boolean
  result: unknown
  error?: string
  /** The run's own id, which is what an approval decision is addressed to. */
  runId?: string
  /** `'suspended'` while the run is waiting on approvals. */
  runStatus?: string
  pendingApprovals: PendingApproval[]
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
      runId: outcome.body?.runId,
      runStatus: outcome.body?.status,
      pendingApprovals: outcome.body?.pendingApprovals ?? [],
      modelCalls,
      ownCalls: modelCalls.filter((call) => call.userMessage === message),
    }
  },
})

export interface RpcCallResult {
  status: number
  ok: boolean
  body: unknown
  /** The whole response as text, so leak assertions can search it. */
  serialized: string
}

/**
 * Calls an exposed RPC as a given principal.
 *
 * The step target is a static literal; the RPC it dispatches is ordinary step
 * data, which is what lets the four thread-management RPCs share one step. It
 * never throws on a non-2xx — a refusal is the assertion in most of these
 * scenarios, so status is data.
 */
export const callsRpcAs = pikkuScenarioStep<
  { rpcName: string; data: Record<string, unknown>; identity?: Identity },
  RpcCallResult
>({
  name: 'callsRpcAs',
  description: 'calls an RPC as a principal',
  template: 'calls {rpcName}',
  func: async (_services, { rpcName, data, identity }, { scenarioStep }) => {
    const outcome = await postRpc(
      apiUrlOf(scenarioStep.env),
      rpcName,
      identity ?? {},
      data
    )
    return {
      status: outcome.status,
      ok: outcome.ok,
      body: outcome.body ?? null,
      serialized: JSON.stringify(outcome.body ?? null),
    }
  },
})

/**
 * The shape an approval decision resolves to.
 *
 * Deliberately the same three fields `runsAgent` exposes, so one assertion step
 * reads both a freshly suspended run and a resumed one.
 */
export interface ApprovalResolution {
  status: number
  runStatus?: string
  pendingApprovals: PendingApproval[]
  result: unknown
}

/**
 * Answers every approval a run is waiting on, all the same way.
 *
 * The decision is addressed to `runId`, not to the thread: a thread can hold
 * several runs and only the suspended one has calls to resolve.
 */
export const resolvesApprovals = pikkuScenarioStep<
  {
    agent: string
    runId?: string
    pendingApprovals: PendingApproval[]
    approved: boolean
    identity?: Identity
  },
  ApprovalResolution
>({
  name: 'resolvesApprovals',
  description: 'approves or denies every pending tool call',
  template: 'resolves approvals approved={approved}',
  func: async (
    _services,
    { agent, runId, pendingApprovals, approved, identity },
    { scenarioStep }
  ) => {
    const outcome = await postAgentApproval(
      apiUrlOf(scenarioStep.env),
      agent,
      identity ?? {},
      {
        runId,
        approvals: pendingApprovals.map(({ toolCallId }) => ({
          toolCallId,
          approved,
        })),
      }
    )
    return {
      status: outcome.status,
      runStatus: outcome.body?.status,
      pendingApprovals: outcome.body?.pendingApprovals ?? [],
      result: outcome.body?.result ?? null,
    }
  },
})

/**
 * Empties the todo store the approval scenarios assert against.
 *
 * It is a `given`, not a scenario `before`, because it is the same shared store
 * every approval scenario writes to and the ladder should say so.
 */
export const resetsTodos = pikkuScenarioStep<void, { reset: true }>({
  name: 'resetsTodos',
  description: 'resets the todo list',
  func: async (_services, _data, { scenarioStep }) => {
    await postRpc(apiUrlOf(scenarioStep.env), 'todos:resetTodos', {}, {})
    return { reset: true }
  },
})
