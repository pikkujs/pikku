export const serializePublicAgent = (pathToPikkuTypes: string) => {
  return `import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'
import { streamAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamChannel } from '@pikku/core/ai-agent'

export const agentCaller = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  unknown
>({
  auth: false,
  func: async (_services, data, { rpc }) => {
    return await rpc.agent(data.agentName, {
      message: data.message,
      threadId: data.threadId,
      resourceId: data.resourceId,
    })
  },
})

wireHTTP({
  route: '/agent/:agentName',
  method: 'options',
  auth: false,
  func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
})

wireHTTP({
  route: '/agent/:agentName',
  method: 'post',
  auth: false,
  func: agentCaller,
})

export const agentStreamCaller = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  void
>({
  auth: false,
  func: async (services, data, { channel }) => {
    if (!channel) throw new Error('SSE channel not available')
    await streamAIAgent(
      data.agentName,
      { message: data.message, threadId: data.threadId, resourceId: data.resourceId },
      channel as AIStreamChannel,
      { singletonServices: services }
    )
  },
})

wireHTTP({
  route: '/agent/:agentName/stream',
  method: 'options',
  auth: false,
  func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
})

wireHTTP({
  route: '/agent/:agentName/stream',
  method: 'post',
  auth: false,
  sse: true,
  func: agentStreamCaller,
})

export const agentApproveCaller = pikkuSessionlessFunc<
  { agentName: string; runId: string; approvals: { toolCallId: string; approved: boolean }[] },
  unknown
>({
  auth: false,
  func: async (services, data) => {
    const aiRunState = services.aiRunState
    if (!aiRunState) throw new Error('AIRunStateService not available')

    const run = await aiRunState.getRun(data.runId)
    if (!run) throw new Error('Run not found: ' + data.runId)
    if (run.status !== 'suspended') throw new Error('Run is not suspended: ' + run.status)

    await aiRunState.updateRun(data.runId, {
      status: 'running',
      pendingApprovals: undefined,
    })

    return { status: 'resumed', runId: data.runId }
  },
})

wireHTTP({
  route: '/agent/:agentName/approve',
  method: 'post',
  auth: false,
  func: agentApproveCaller,
})
`
}
