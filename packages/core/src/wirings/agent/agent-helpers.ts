import type { AgentInterruptResult } from './agent-interrupt.js'

/**
 * Builds a function config that runs `agentName` to completion through `rpc.agent.run` and
 * returns its result, for wiring an agent as an ordinary (non-streaming) endpoint.
 *
 * The agent's own `auth`, `scopes` and `permissions` are checked on every call, and the thread
 * is partitioned under the caller's session principal, so a client-supplied `resourceId` can never
 * reach another user's thread. A run that hits a tool needing approval returns `status: 'suspended'`
 * with its `pendingApprovals`.
 *
 * @param agentName - The agent to run.
 * @returns A `{ func }` to pass to `wireHTTP`, `wireChannel` or similar.
 * @example snippet: aiAgentInvoke
 */
export function agent<TAgentMap extends Record<string, { output: any }>>(
  agentName: string & keyof TAgentMap
): { func: (services: any, data: any, wire: any) => Promise<any> } {
  return {
    func: async (_services: any, data: any, { rpc }: any) => {
      return rpc.agent.run(agentName, data)
    },
  }
}

/**
 * Builds a function config that streams an agent run to the wire's channel as AG-UI events,
 * through `rpc.agent.stream`. Requires a wiring that provides a channel (an SSE route or a
 * WebSocket); authorization and thread partitioning are as for `agent`.
 *
 * @param agentName - The agent to stream. When omitted, it is read from `agentName` on the input,
 * so one route can serve several agents; every agent stays subject to its own auth checks.
 * @returns A `{ func }` to pass to a streaming wiring.
 * @throws Error when no agent name is given either way, or the wire has no channel.
 * @example snippet: aiAgentStream
 */
export function agentStream<TAgentMap extends Record<string, { output: any }>>(
  agentName?: string & keyof TAgentMap
): { func: (services: any, data: any, wire: any) => Promise<void> } {
  return {
    func: async (_services: any, data: any, { rpc }: any) => {
      if (agentName) {
        await rpc.agent.stream(agentName, data)
      } else {
        const { agentName: name, ...rest } = data
        if (!name) {
          throw new Error(
            'agentStream requires an agentName either as a parameter or in the input data'
          )
        }
        await rpc.agent.stream(name, rest)
      }
    },
  }
}

/**
 * Builds a function config that answers one pending tool approval on a suspended run and streams
 * the continuation, through `rpc.agent.resume`.
 *
 * Only the run's owner (the session principal it was created under) may resume it, and the agent's
 * auth checks run again, so a revoked grant blocks the resume. Concurrent resumes of the same tool
 * call are claimed atomically; the loser fails rather than running the tool twice.
 *
 * @returns A `{ func }` taking `{ runId, toolCallId, approved }`, for a streaming wiring.
 * @example snippet: agentApproval
 */
export function agentResume(): {
  func: (
    services: any,
    data: { runId: string; toolCallId: string; approved: boolean },
    wire: any
  ) => Promise<void>
} {
  return {
    func: async (
      _services: any,
      data: { runId: string; toolCallId: string; approved: boolean },
      { rpc }: any
    ) => {
      await rpc.agent.resume(data.runId, {
        toolCallId: data.toolCallId,
        approved: data.approved,
      })
    },
  }
}

/**
 * Builds a function config that stops a running agent (barge-in, a stop button, a timeout),
 * through `rpc.agent.interrupt`.
 *
 * Only the run's owner may interrupt it; the agent's auth checks are deliberately not re-run, so a
 * user can always stop their own run. Tools already executing keep running and are reported in the
 * result rather than rolled back.
 *
 * @returns A `{ func }` taking `{ runId, reason? }` and returning whether the run was stopped and
 * which tools were still in flight.
 */
export function agentInterrupt(): {
  func: (
    services: any,
    data: { runId: string; reason?: 'speech' | 'user' | 'timeout' },
    wire: any
  ) => Promise<AgentInterruptResult>
} {
  return {
    func: async (
      _services: any,
      data: { runId: string; reason?: 'speech' | 'user' | 'timeout' },
      { rpc }: any
    ) => {
      return rpc.agent.interrupt(data.runId, data.reason)
    },
  }
}

/**
 * Builds a function config that answers a batch of pending tool approvals and runs the suspended
 * agent to completion without streaming, through `rpc.agent.approve`.
 *
 * Ownership, re-authorization and the once-only claim behave as for `agentResume`. The route is
 * scoped to `agentName`: a run that belongs to any other agent is refused with a `ForbiddenError`
 * (403), even when the caller owns it.
 *
 * @param agentName - The agent this route answers approvals for; also types the result.
 * @returns A `{ func }` taking `{ runId, approvals }`.
 * @throws ForbiddenError when the run belongs to a different agent.
 * @throws Error when every approval in the batch was already resolved by another caller.
 * @example snippet: agentApproval
 */
export function agentApprove<TAgentMap extends Record<string, { output: any }>>(
  agentName: string & keyof TAgentMap
): {
  func: (
    services: any,
    data: {
      runId: string
      approvals: { toolCallId: string; approved: boolean }[]
    },
    wire: any
  ) => Promise<any>
} {
  return {
    func: async (
      _services: any,
      data: {
        runId: string
        approvals: { toolCallId: string; approved: boolean }[]
      },
      { rpc }: any
    ) => {
      return rpc.agent.approve(data.runId, data.approvals, agentName)
    },
  }
}
