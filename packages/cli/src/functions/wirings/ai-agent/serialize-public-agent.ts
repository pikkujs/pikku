export const serializePublicAgent = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'

export const agentCaller = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId: string },
  unknown
>({
  auth: ${authFlag},
  func: async (_services, data, { rpc }) => {
    return await rpc.agent.run(data.agentName, {
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
    await rpc.agent.stream(data.agentName, {
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
