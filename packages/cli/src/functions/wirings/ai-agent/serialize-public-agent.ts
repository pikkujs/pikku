export const serializePublicAgent = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'
import { streamAIAgent, approveAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamChannel } from '@pikku/core/ai-agent'

export const agentCaller = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  unknown
>({
  auth: ${authFlag},
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
  auth: ${authFlag},
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
  auth: ${authFlag},
  func: async ({ aiRunState }, { runId, approvals, agentName }) => {
    if (!aiRunState) {
      throw new Error('AIRunStateService not available')
    }
    return await approveAIAgent(aiRunState, runId, approvals, agentName)
  },
})

wireHTTP({
  route: '/rpc/agent/:agentName',
  method: 'options',
  tags: ['pikku:public'],
  auth: ${authFlag},
  func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
})

wireHTTP({
  route: '/rpc/agent/:agentName',
  method: 'post',
  tags: ['pikku:public'],
  auth: ${authFlag},
  func: agentCaller,
})

wireHTTP({
  route: '/rpc/agent/:agentName/stream',
  method: 'options',
  tags: ['pikku:public'],
  auth: ${authFlag},
  func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
})

wireHTTP({
  route: '/rpc/agent/:agentName/stream',
  method: 'get',
  tags: ['pikku:public'],
  auth: ${authFlag},
  sse: true,
  func: agentStreamCaller,
})

wireHTTP({
  route: '/rpc/agent/:agentName/approve',
  method: 'post',
  tags: ['pikku:public'],
  auth: ${authFlag},
  func: agentApproveCaller,
})
`
}
