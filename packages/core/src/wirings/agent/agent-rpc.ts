import type { PikkuRawWire } from '../../types/core.types.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import type {
  AgentInput,
  AgentRPCOptions,
  AgentStreamChannel,
} from './agent.types.js'
import { assertAgentExposed, type StreamAgentOptions } from './agent-prepare.js'
import { NotFoundError } from '../../errors/errors.js'
import { pikkuState } from '../../pikku-state.js'
import { mapAddonCall } from '../addon/addon-reach.js'
import { runAgent, resumeAgentSync } from './agent-runner.js'
import { streamAgent, resumeAgent, interruptAgent } from './agent-stream.js'
import { wrapChannelWithAGUI } from './agent-agui.js'

export type { AgentRPCOptions }

/**
 * `wire.rpc.agent`, implemented.
 *
 * Lives here rather than in `rpc-runner` so the agent surface is one file next
 * to the runner and stream code it delegates to, instead of a wing of the RPC
 * primitive.
 */
export const createAgentRPC = (
  wire: PikkuRawWire,
  options: AgentRPCOptions,
  exposed = false
): PikkuRPC['agent'] => {
  const agent = createAgent(wire, options)
  if (!exposed) return agent
  // The external entry: the same calls, each refused as a 404 unless the named
  // agent is `expose: true`. Checked on the name as given, before addon mapping.
  const requireExposed = (agentName: string | undefined) => {
    // A resume or approve names the agent it expects the run to belong to. With
    // none there is nothing to check the gate against, so it is refused.
    if (agentName === undefined) {
      throw new NotFoundError('AI agent not found')
    }
    assertAgentExposed(agentName)
  }
  return {
    run: async (agentName, input) => {
      assertAgentExposed(agentName)
      return agent.run(agentName, input)
    },
    stream: async (agentName, input, streamOptions) => {
      assertAgentExposed(agentName)
      return agent.stream(agentName, input, streamOptions)
    },
    resume: async (runId, input, streamOptions) => {
      requireExposed(input.expectedAgentName)
      return agent.resume(runId, input, streamOptions)
    },
    approve: async (runId, approvals, expectedAgentName) => {
      requireExposed(expectedAgentName)
      return agent.approve(runId, approvals, expectedAgentName)
    },
    // Stopping a run is not something a route offers.
    interrupt: async () => {
      throw new NotFoundError('AI agent not found')
    },
  }
}

const createAgent = (
  wire: PikkuRawWire,
  options: AgentRPCOptions
): PikkuRPC['agent'] => {
  const params = () => ({
    sessionService: options.sessionService,
    getCredential: wire.getCredential?.bind(wire),
    trace: wire.trace,
  })

  const streamingChannel = (): AgentStreamChannel => {
    const channel = wire.channel as unknown as AgentStreamChannel | undefined
    if (!channel) throw new Error('No channel available for streaming')
    return channel
  }

  /** `run` and `approve` return the same shape; only the call differs. */
  const asRunResult = (result: Awaited<ReturnType<typeof runAgent>>) => ({
    runId: result.runId,
    result: result.object ?? result.text,
    usage: result.usage,
    ...(result.status === 'suspended' && {
      status: 'suspended' as const,
      pendingApprovals: result.pendingApprovals,
    }),
  })

  return {
    run: async (agentName: string, input: AgentInput) =>
      asRunResult(
        await runAgent(
          mapAddonCall(wire.addonNamespace, agentName),
          input,
          params()
        )
      ),

    stream: async (
      agentName: string,
      input: {
        message: string
        threadId: string
        resourceId: string
        model?: string
        temperature?: number
      },
      streamOptions?: StreamAgentOptions
    ) => {
      let currentRunId: string | undefined
      await streamAgent(
        mapAddonCall(wire.addonNamespace, agentName),
        input,
        wrapChannelWithAGUI(streamingChannel(), {
          threadId: input.threadId,
          getRunId: () => currentRunId,
        }),
        params(),
        undefined,
        {
          ...streamOptions,
          onRunCreated: (runId) => {
            currentRunId = runId
            streamOptions?.onRunCreated?.(runId)
          },
        }
      )
    },

    resume: async (
      runId: string,
      input: {
        toolCallId: string
        approved: boolean
        expectedAgentName?: string
      },
      streamOptions?: StreamAgentOptions
    ) => {
      const { expectedAgentName, ...answer } = input
      await resumeAgent(
        {
          runId,
          ...answer,
          ...(expectedAgentName === undefined
            ? {}
            : {
                expectedAgentName: mapAddonCall(
                  wire.addonNamespace,
                  expectedAgentName
                ),
              }),
        },
        wrapChannelWithAGUI(streamingChannel(), { runId }),
        params(),
        streamOptions
      )
    },

    interrupt: async (runId: string, reason?: 'speech' | 'user' | 'timeout') =>
      interruptAgent(
        { runId, ...(reason ? { reason } : {}) },
        { sessionService: options.sessionService }
      ),

    approve: async (
      runId: string,
      approvals: { toolCallId: string; approved: boolean }[],
      expectedAgentName?: string
    ) =>
      asRunResult(
        await resumeAgentSync(
          runId,
          approvals,
          params(),
          expectedAgentName === undefined
            ? undefined
            : mapAddonCall(wire.addonNamespace, expectedAgentName)
        )
      ),
  }
}

/**
 * The RPC primitive offers `rpc.agent` but must not import this file — a static
 * reference from `rpc-runner` pins the whole agent runtime into every
 * deployment unit, including the ones that hold no agent. Registering the
 * factory here inverts that: only a unit that imports `@pikku/core/agent` pays
 * for it, which is the same seam the inspector already uses to decide whether
 * a unit requires the agent services.
 */
pikkuState(null, 'agent', 'rpcFactory', createAgentRPC)
