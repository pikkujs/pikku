export const serializePublicAgent = (pathToPikkuTypes: string) => {
  return `import { pikkuSessionlessFunc, pikkuChannelFunc, wireHTTP } from '${pathToPikkuTypes}'
import { streamAIAgent, approveAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamChannel } from '@pikku/core/ai-agent'

export const agentCaller = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  unknown
>({
  auth: false,
  func: async (_services, data, { rpc }) => {
    return await (rpc.agent as any)(data.agentName, {
      message: data.message,
      threadId: data.threadId,
      resourceId: data.resourceId,
    })
  },
})

export const agentStreamCaller = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  void
>({
  auth: false,
  func: async (services, data, { channel }) => {
    await streamAIAgent(
      data.agentName,
      { message: data.message, threadId: data.threadId, resourceId: data.resourceId },
      channel as unknown as AIStreamChannel,
      { singletonServices: services }
    )
  },
})

export const agentApproveCaller = pikkuSessionlessFunc<
  { agentName: string; runId: string; approvals: { toolCallId: string; approved: boolean }[] },
  unknown
>({
  auth: false,
  func: async (services, data) => {
    return await approveAIAgent(data.runId, data.approvals, services)
  },
})

wireHTTP({
  route: '/rpc/agent/:agentName',
  method: 'options',
  auth: false,
  func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
})

wireHTTP({
  route: '/rpc/agent/:agentName',
  method: 'post',
  auth: false,
  func: agentCaller,
})

wireHTTP({
  route: '/rpc/agent/:agentName/stream',
  method: 'options',
  auth: false,
  func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
})

wireHTTP({
  route: '/rpc/agent/:agentName/stream',
  method: 'get',
  auth: false,
  sse: true,
  func: agentStreamCaller,
})

wireHTTP({
  route: '/rpc/agent/:agentName/approve',
  method: 'post',
  auth: false,
  func: agentApproveCaller,
})
`
}
