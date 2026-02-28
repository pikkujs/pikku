export const serializePublicAgent = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `import { pikkuSessionlessFunc, defineHTTPRoutes, wireHTTPRoutes } from '${pathToPikkuTypes}'

export const agentCaller = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  unknown
>({
  auth: ${authFlag},
  func: async (_services, data, { rpc }) => {
    return await rpc.agent.run(data.agentName as any, {
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
  func: async (_services, data, { rpc }) => {
    await rpc.agent.stream(data.agentName as any, {
      message: data.message,
      threadId: data.threadId,
      resourceId: data.resourceId,
    })
  },
})

export const agentApproveCaller = pikkuSessionlessFunc<
  { agentName: string; runId: string; approvals: { toolCallId: string; approved: boolean }[] },
  unknown
>({
  auth: ${authFlag},
  func: async (_services, { runId, approvals, agentName }, { rpc }) => {
    return await rpc.agent.approve(runId, approvals, agentName)
  },
})

export const agentRoutes = defineHTTPRoutes({
  auth: ${authFlag},
  tags: ['pikku:public'],
  routes: {
    agentRun: {
      route: '/rpc/agent/:agentName',
      method: 'post',
      func: agentCaller,
    },
    agentStream: {
      route: '/rpc/agent/:agentName/stream',
      method: 'post',
      sse: true,
      func: agentStreamCaller,
    },
    agentApprove: {
      route: '/rpc/agent/:agentName/approve',
      method: 'post',
      func: agentApproveCaller,
    },
  },
})

wireHTTPRoutes({ routes: { agent: agentRoutes } })
`
}
