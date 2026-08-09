import type { PikkuRawWire } from '../../types/core.types.js'
import type { SessionService } from '../../services/user-session-service.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type { PikkuRPC } from '../rpc/rpc-types.js'
import type { AIAgentInput, AIStreamChannel } from './ai-agent.types.js'
import type { StreamAIAgentOptions } from './ai-agent-prepare.js'
import { runAIAgent, resumeAIAgentSync } from './ai-agent-runner.js'
import {
  streamAIAgent,
  resumeAIAgent,
  interruptAIAgent,
} from './ai-agent-stream.js'
import { wrapChannelWithAGUI } from './ai-agent-agui.js'

export type AgentRPCOptions = {
  sessionService?: SessionService<CoreUserSession>
}

/**
 * `wire.rpc.agent`, implemented.
 *
 * Lives here rather than in `rpc-runner` so the agent surface is one file next
 * to the runner and stream code it delegates to, instead of a wing of the RPC
 * primitive.
 */
export const createAgentRPC = (
  wire: PikkuRawWire,
  options: AgentRPCOptions
): PikkuRPC['agent'] => {
  const params = () => ({
    sessionService: options.sessionService,
    getCredential: wire.getCredential?.bind(wire),
  })

  const streamingChannel = (): AIStreamChannel => {
    const channel = wire.channel as unknown as AIStreamChannel | undefined
    if (!channel) throw new Error('No channel available for streaming')
    return channel
  }

  /** `run` and `approve` return the same shape; only the call differs. */
  const asRunResult = (result: Awaited<ReturnType<typeof runAIAgent>>) => ({
    runId: result.runId,
    result: result.object ?? result.text,
    usage: result.usage,
    ...(result.status === 'suspended' && {
      status: 'suspended' as const,
      pendingApprovals: result.pendingApprovals,
    }),
  })

  return {
    run: async (agentName: string, input: AIAgentInput) =>
      asRunResult(await runAIAgent(agentName, input, params())),

    stream: async (
      agentName: string,
      input: {
        message: string
        threadId: string
        resourceId: string
        model?: string
        temperature?: number
      },
      streamOptions?: StreamAIAgentOptions
    ) => {
      let currentRunId: string | undefined
      await streamAIAgent(
        agentName,
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
      input: { toolCallId: string; approved: boolean },
      streamOptions?: StreamAIAgentOptions
    ) => {
      await resumeAIAgent(
        { runId, ...input },
        wrapChannelWithAGUI(streamingChannel(), { runId }),
        params(),
        streamOptions
      )
    },

    interrupt: async (runId: string, reason?: 'speech' | 'user' | 'timeout') =>
      interruptAIAgent(
        { runId, ...(reason ? { reason } : {}) },
        { sessionService: options.sessionService }
      ),

    approve: async (
      runId: string,
      approvals: { toolCallId: string; approved: boolean }[],
      expectedAgentName?: string
    ) =>
      asRunResult(
        await resumeAIAgentSync(
          runId,
          approvals,
          { sessionService: options.sessionService },
          expectedAgentName
        )
      ),
  }
}
