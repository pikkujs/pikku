export const serializePublicAgent = (pathToPikkuTypes: string) => {
  return `import { pikkuSessionlessFunc, pikkuChannelFunc, wireHTTPRoutes } from '${pathToPikkuTypes}'
import { pikkuState } from '@pikku/core'
import { streamAIAgent, approveAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamChannel } from '@pikku/core/ai-agent'

const agentRoutes = [
  { pikkuFuncId: 'agentCaller', route: '/rpc/agent/:agentName', method: 'post' },
  { pikkuFuncId: 'agentStreamCaller', route: '/rpc/agent/:agentName/stream', method: 'post', sse: true },
  { pikkuFuncId: 'agentApproveCaller', route: '/rpc/agent/:agentName/approve', method: 'post' },
  { pikkuFuncId: 'http:options:/rpc/agent/:agentName', route: '/rpc/agent/:agentName', method: 'options' },
  { pikkuFuncId: 'http:options:/rpc/agent/:agentName/stream', route: '/rpc/agent/:agentName/stream', method: 'options' },
]

const httpMeta = pikkuState(null, 'http', 'meta')
for (const r of agentRoutes) {
  if (!httpMeta[r.method]) httpMeta[r.method] = {}
  httpMeta[r.method][r.route] = r
}

const funcMeta = pikkuState(null, 'function', 'meta')
for (const r of agentRoutes) {
  funcMeta[r.pikkuFuncId] = {
    pikkuFuncId: r.pikkuFuncId,
    functionType: 'inline',
    sessionless: true,
    name: r.pikkuFuncId,
  }
}

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

export const agentStreamCaller = pikkuChannelFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  void
>({
  auth: false,
  func: async (services, data, { channel }) => {
    await streamAIAgent(
      data.agentName,
      { message: data.message, threadId: data.threadId, resourceId: data.resourceId },
      channel as AIStreamChannel,
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

wireHTTPRoutes({
  auth: false,
  routes: {
    options: { route: '/rpc/agent/:agentName', method: 'options', func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0) },
    call: { route: '/rpc/agent/:agentName', method: 'post', func: agentCaller },
    streamOptions: { route: '/rpc/agent/:agentName/stream', method: 'options', func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0) },
    stream: { route: '/rpc/agent/:agentName/stream', method: 'post', sse: true, func: agentStreamCaller },
    approve: { route: '/rpc/agent/:agentName/approve', method: 'post', func: agentApproveCaller },
  },
})
`
}
