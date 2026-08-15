/**
 * Effect steps for the deterministic agent scenarios.
 *
 * These replace the `I run agent …` family in tests/steps — ten cucumber
 * definitions that differed only in which optional field they bolted on.
 *
 * None of them throws on a non-2xx. A refusal is the expected outcome in twelve
 * of these scenarios, so status is data the assertion steps read.
 */
import { pikkuScenarioStep } from '#pikku/scenarios/pikku-scenario-types.gen.js'
import { requireScenarioEnv } from '@pikku/core/scenario'
import type { ScenarioHttpResponse } from '@pikku/core/scenario'
import { randomUUID } from 'node:crypto'
import {
  postAgent,
  postAgentApproval,
  postRpc,
  readModelCalls,
  type Identity,
  type MockLlmCall,
} from './agent-transport.js'

/**
 * An image or file part sent alongside the message.
 *
 * `data` is base64 — the fixture bytes are a 1x1 PNG regardless of the declared
 * media type, because every assertion here is about the media type and the part
 * shape reaching the model, never about decoding the bytes.
 */
export interface AgentAttachment {
  type: 'image' | 'file'
  data: string
  mediaType: string
  filename?: string
}

/** One tool call the run is waiting on a human decision for. */
export interface PendingApproval {
  toolCallId: string
  toolName: string
  reason: string
}

/**
 * The envelope the agent routes answer with, whatever the outcome — a result,
 * a refusal, or a run suspended on approvals. Named once here so the steps read
 * a typed body off the transport's `unknown` instead of each doing it inline.
 */
interface AgentReplyBody {
  result?: unknown
  message?: string
  errorId?: string
  runId?: string
  status?: string
  pendingApprovals?: PendingApproval[]
}

const replyBody = ({ body }: ScenarioHttpResponse): AgentReplyBody =>
  (body ?? {}) as AgentReplyBody

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
  default: async (_services, _data) => ({ threadId: randomUUID() }),
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
    /**
     * Which scripted reply the mock provider should give. Omit it on the
     * `ai-live` tier: there is no `mock` provider once `PIKKU_MOCK_LLM=0`, so
     * naming a script there would route the run at a provider that does not
     * exist. Without one the agent runs on the model it declares.
     */
    script?: string
    message: string
    threadId: string
    resourceId: string
    identity?: Identity
    context?: string
    temperature?: number
    attachments?: AgentAttachment[]
  },
  AgentRunResult
>({
  name: 'runsAgent',
  description: 'runs an agent',
  // No "with" before the script: an omitted one renders as nothing, and a
  // dangling "runs todoReadAgent with" is worse prose than the missing word.
  template: 'runs {agent} {script}',
  default: async (
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
      attachments,
    },
    { scenarioStep }
  ) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    const before = (await readModelCalls(apiUrl)).length

    const outcome = await postAgent(apiUrl, agent, identity ?? {}, {
      message,
      threadId,
      resourceId,
      ...(script === undefined ? {} : { model: `mock/${script}` }),
      ...(context === undefined ? {} : { context }),
      ...(temperature === undefined ? {} : { temperature }),
      ...(attachments === undefined ? {} : { attachments }),
    })

    const modelCalls = (await readModelCalls(apiUrl)).slice(before)
    const reply = replyBody(outcome)

    return {
      status: outcome.status,
      ok: outcome.ok,
      result: reply.result ?? null,
      error: reply.message ?? reply.errorId,
      runId: reply.runId,
      runStatus: reply.status,
      pendingApprovals: reply.pendingApprovals ?? [],
      modelCalls,
      ownCalls: modelCalls.filter((call) => call.userMessage === message),
    }
  },
})

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
  ScenarioHttpResponse
>({
  name: 'callsRpcAs',
  description: 'calls an RPC as a principal',
  template: 'calls {rpcName}',
  default: async (_services, { rpcName, data, identity }, { scenarioStep }) => {
    const outcome = await postRpc(
      requireScenarioEnv(scenarioStep).apiUrl,
      rpcName,
      identity ?? {},
      data
    )
    return { ...outcome, body: outcome.body ?? null }
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
  default: async (
    _services,
    { agent, runId, pendingApprovals, approved, identity },
    { scenarioStep }
  ) => {
    const outcome = await postAgentApproval(
      requireScenarioEnv(scenarioStep).apiUrl,
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
    const reply = replyBody(outcome)
    return {
      status: outcome.status,
      runStatus: reply.status,
      pendingApprovals: reply.pendingApprovals ?? [],
      result: reply.result ?? null,
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
  default: async (_services, _data, { scenarioStep }) => {
    await postRpc(
      requireScenarioEnv(scenarioStep).apiUrl,
      'todos:resetTodos',
      {},
      {}
    )
    return { reset: true }
  },
})
