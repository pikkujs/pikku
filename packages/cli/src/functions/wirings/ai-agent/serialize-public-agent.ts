export const serializePublicAgent = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true,
  globalHTTPPrefix: string = ''
) => {
  const authFlag = requireAuth ? 'true' : 'false'

  // Emitted inline at each call site rather than as a shared named alias: the
  // schema extractor only reads type literals in the generic position, and
  // synthesises the schema name from the function name. Behind a named alias it
  // records an `inputSchemaName` with no schema behind it, and every agent call
  // then fails at runtime with MissingSchemaError.
  const callerInput = `{
    agentName: string
    message: string
    threadId: string
    resourceId: string
    attachments?: {
      type: 'image' | 'file'
      data?: string
      url?: string
      mediaType?: string
      filename?: string
    }[]
    model?: string
    temperature?: number
    context?: string
  }`

  return `import { canAccessThread, threadOwnerConstraint } from '@pikku/core/ai-agent'
import { pikkuSessionlessFunc, pikkuPermission, defineHTTPRoutes, wireHTTPRoutes } from '${pathToPikkuTypes}'

/**
 * Thread reads are keyed by a caller-supplied \`threadId\`, so ownership cannot
 * come from the request — it is derived from the session and checked against
 * the stored thread's resourceId.
 */
export const isThreadOwner = pikkuPermission<{ threadId: string }>(
  async ({ agentRunService }, { threadId }, { session }) => {
    const thread = await agentRunService.getThread(threadId)
    // A missing thread is denied rather than 404'd so it is indistinguishable
    // from one owned by someone else — no existence oracle.
    if (!thread) return false
    return canAccessThread(thread.resourceId, session)
  }
)

export const agentCaller = pikkuSessionlessFunc<${callerInput}, unknown>({
  tags: ['pikku'],
  auth: ${authFlag},
  func: async (_services, data, { rpc }) => {
    return await rpc.agent.run(data.agentName as any, {
      message: data.message,
      threadId: data.threadId,
      resourceId: data.resourceId,
      ...(data.attachments ? { attachments: data.attachments } : {}),
      ...(data.model ? { model: data.model } : {}),
      ...(data.temperature !== undefined ? { temperature: data.temperature } : {}),
      ...(data.context ? { context: data.context } : {}),
    })
  },
})

export const agentStreamCaller = pikkuSessionlessFunc<${callerInput}, void>({
  tags: ['pikku'],
  auth: ${authFlag},
  func: async (_services, data, { rpc }) => {
    await rpc.agent.stream(data.agentName as any, {
      message: data.message,
      threadId: data.threadId,
      resourceId: data.resourceId,
      ...(data.attachments ? { attachments: data.attachments } : {}),
      ...(data.model ? { model: data.model } : {}),
      ...(data.temperature !== undefined ? { temperature: data.temperature } : {}),
      ...(data.context ? { context: data.context } : {}),
    })
  },
})

export const agentApproveCaller = pikkuSessionlessFunc<
  { agentName: string; runId: string; approvals: { toolCallId: string; approved: boolean }[] },
  unknown
>({
  tags: ['pikku'],
  auth: ${authFlag},
  func: async (_services, { runId, approvals, agentName }, { rpc }) => {
    return await rpc.agent.approve(runId, approvals, agentName)
  },
})

export const agentResumeCaller = pikkuSessionlessFunc<
  { agentName: string; runId: string; toolCallId: string; approved: boolean },
  void
>({
  tags: ['pikku'],
  auth: ${authFlag},
  func: async (_services, data, { rpc }) => {
    await rpc.agent.resume(data.runId, {
      toolCallId: data.toolCallId,
      approved: data.approved,
    })
  },
})

export const getAgentThreads = pikkuSessionlessFunc<
  { agentName?: string; resourceId?: string; limit?: number; offset?: number },
  any[]
>({
  tags: ['pikku', 'pikku:agent'],
  title: 'Get Agent Threads',
  description:
    'Returns the caller\\'s AI agent threads from storage. Accepts optional filters: agentName, resourceId, limit, and offset for pagination.',
  expose: true,
  auth: ${authFlag},
  func: async ({ agentRunService }, input, { session }) => {
    // \`owners\` is an authorization constraint derived from the session, never
    // from input — \`resourceId\` remains a caller-supplied filter within it.
    return await agentRunService.listThreads({
      agentName: input?.agentName,
      resourceId: input?.resourceId,
      owners: threadOwnerConstraint(session),
      limit: input?.limit,
      offset: input?.offset,
    })
  },
})

export const getAgentThreadMessages = pikkuSessionlessFunc<
  { threadId: string; resourceId?: string },
  any[]
>({
  tags: ['pikku', 'pikku:agent'],
  title: 'Get Agent Thread Messages',
  description:
    'Returns all messages for a given AI agent thread, ordered by creation time.',
  expose: true,
  auth: ${authFlag},
  permissions: { owner: isThreadOwner },
  func: async ({ agentRunService }, input) => {
    return await agentRunService.getThreadMessages(input.threadId)
  },
})

export const getAgentThreadRuns = pikkuSessionlessFunc<
  { threadId: string; resourceId?: string },
  any[]
>({
  tags: ['pikku', 'pikku:agent'],
  title: 'Get Agent Thread Runs',
  description:
    'Returns the run history for a given AI agent thread, ordered by creation time.',
  expose: true,
  auth: ${authFlag},
  permissions: { owner: isThreadOwner },
  func: async ({ agentRunService }, input) => {
    return await agentRunService.getThreadRuns(input.threadId)
  },
})

export const deleteAgentThread = pikkuSessionlessFunc<
  { threadId: string; resourceId?: string },
  { deleted: boolean }
>({
  tags: ['pikku', 'pikku:agent'],
  title: 'Delete Agent Thread',
  description:
    'Deletes an AI agent thread and all of its persisted state.',
  expose: true,
  auth: ${authFlag},
  permissions: { owner: isThreadOwner },
  func: async ({ agentRunService }, input) => {
    const deleted = await agentRunService.deleteThread(input.threadId)
    return { deleted }
  },
})

export const agentRoutes = defineHTTPRoutes({
  auth: ${authFlag},
  tags: ['pikku:public'],
  routes: {
    agentRun: {
      route: '${globalHTTPPrefix}/rpc/agent/:agentName',
      method: 'post',
      func: agentCaller,
    },
    agentStream: {
      route: '${globalHTTPPrefix}/rpc/agent/:agentName/stream',
      method: 'post',
      sse: true,
      func: agentStreamCaller,
    },
    agentApprove: {
      route: '${globalHTTPPrefix}/rpc/agent/:agentName/approve',
      method: 'post',
      func: agentApproveCaller,
    },
    agentResume: {
      route: '${globalHTTPPrefix}/rpc/agent/:agentName/resume',
      method: 'post',
      sse: true,
      func: agentResumeCaller,
    },
  },
})

wireHTTPRoutes({ routes: { agent: agentRoutes } })
`
}
