/**
 * Steps that drive an agent through the generated client — `pikkuRPC.agent.run`,
 * `.stream` and `.approve` from `.pikku/sdk/api/exposed/pikku-rpc.gen.ts`, over `PikkuFetch` — the
 * same code a screen runs. The other agent scenarios post raw HTTP, so before these
 * nothing exercised the client, which is how its `stream` came to resolve
 * `undefined` without anyone seeing it.
 */
import { pikkuScenarioStep, requireScenarioEnv } from '#pikku/scenario'
import { PikkuAgentStreamError } from '@pikku/fetch'
import { PikkuFetch } from '@sdk/api/pikku-fetch.gen.js'
import { PikkuRPC } from '@sdk/api/pikku-rpc.gen.js'
import { identityHeaders, type Identity } from './agent-transport.js'

type AgentName = Parameters<PikkuRPC['agent']['run']>[0]

const clientFor = (apiUrl: string, identity: Identity = {}): PikkuRPC => {
  const pikkuFetch = new PikkuFetch({ serverUrl: apiUrl })
  for (const [name, value] of Object.entries(identityHeaders(identity))) {
    pikkuFetch.setHeader(name, value)
  }
  const rpc = new PikkuRPC()
  rpc.setPikkuFetch(pikkuFetch)
  return rpc
}

export interface ClientStreamResult {
  /** Every event type the client yielded, in order. */
  types: string[]
  /** The concatenated `TEXT_MESSAGE_CONTENT` deltas. */
  text: string
  /** The tool names of the `pikku:approval-request` events. */
  approvalTools: string[]
  /** The message of the `PikkuAgentStreamError` the loop threw, if it threw one. */
  error?: string
}

export const streamsAgentThroughClient = pikkuScenarioStep<
  {
    agent: string
    script: string
    message: string
    threadId: string
    resourceId: string
    identity?: Identity
  },
  ClientStreamResult
>({
  name: 'streamsAgentThroughClient',
  description: 'streams an agent with the generated client',
  template: 'streams {agent} through the client with {script}',
  default: async (
    _services,
    { agent, script, message, threadId, resourceId, identity },
    { scenarioStep }
  ) => {
    const rpc = clientFor(requireScenarioEnv(scenarioStep).apiUrl, identity)
    const result: ClientStreamResult = {
      types: [],
      text: '',
      approvalTools: [],
    }
    try {
      for await (const event of rpc.agent.stream(agent as AgentName, {
        message,
        threadId,
        resourceId,
        model: `mock/${script}`,
      })) {
        result.types.push(event.type)
        if (event.type === 'TEXT_MESSAGE_CONTENT') result.text += event.delta
        if (
          event.type === 'CUSTOM' &&
          event.name === 'pikku:approval-request'
        ) {
          result.approvalTools.push(event.value.toolName)
        }
      }
    } catch (err) {
      if (!(err instanceof PikkuAgentStreamError)) throw err
      result.error = err.message
    }
    return result
  },
})

export interface ClientRunResult {
  runId: string
  result: unknown
  status: 'suspended' | null
  pendingApprovals: { toolCallId: string; toolName: string; reason?: string }[]
}

const asClientRun = (
  reply: Awaited<ReturnType<PikkuRPC['agent']['run']>>
): ClientRunResult => ({
  runId: reply.runId,
  result: reply.result ?? null,
  status: reply.status ?? null,
  pendingApprovals: (reply.pendingApprovals ?? []).map(
    ({ toolCallId, toolName, reason }) => ({ toolCallId, toolName, reason })
  ),
})

export const runsAgentThroughClient = pikkuScenarioStep<
  {
    agent: string
    script: string
    message: string
    threadId: string
    resourceId: string
    identity?: Identity
  },
  ClientRunResult
>({
  name: 'runsAgentThroughClient',
  description: 'runs an agent with the generated client',
  template: 'runs {agent} through the client with {script}',
  default: async (
    _services,
    { agent, script, message, threadId, resourceId, identity },
    { scenarioStep }
  ) => {
    const rpc = clientFor(requireScenarioEnv(scenarioStep).apiUrl, identity)
    return asClientRun(
      await rpc.agent.run(agent as AgentName, {
        message,
        threadId,
        resourceId,
        model: `mock/${script}`,
      })
    )
  },
})

export const approvesThroughClient = pikkuScenarioStep<
  {
    agent: string
    run: ClientRunResult
    approved: boolean
    identity?: Identity
  },
  ClientRunResult
>({
  name: 'approvesThroughClient',
  description: 'answers every pending approval with the generated client',
  template: 'approves through the client approved={approved}',
  default: async (
    _services,
    { agent, run, approved, identity },
    { scenarioStep }
  ) => {
    const rpc = clientFor(requireScenarioEnv(scenarioStep).apiUrl, identity)
    return asClientRun(
      await rpc.agent.approve(agent as AgentName, {
        runId: run.runId,
        approvals: run.pendingApprovals.map(({ toolCallId }) => ({
          toolCallId,
          approved,
        })),
      })
    )
  },
})

/** Compares what the client handed back with what the scenario expects. */
export const expectsClientValue = pikkuScenarioStep<
  { actual: unknown; equals: unknown },
  { matched: true }
>({
  name: 'expectsClientValue',
  description: 'expects a value the generated client returned',
  default: async (_services, { actual, equals }) => {
    if (JSON.stringify(actual) !== JSON.stringify(equals)) {
      throw new Error(
        `Expected ${JSON.stringify(equals)}, got ${JSON.stringify(actual)}`
      )
    }
    return { matched: true }
  },
})
