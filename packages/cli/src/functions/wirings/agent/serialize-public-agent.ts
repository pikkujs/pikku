export interface PublicAgentGenOutput {
  schemas: string
  functions: string
}

export const serializePublicAgent = (
  leaf: (name: string) => string,
  globalHTTPPrefix: string = ''
): PublicAgentGenOutput => {
  const schemas = `/**
 * Auto-generated public agent schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const Attachment = z.object({
  type: z.enum(['image', 'file']),
  data: z.string().optional(),
  url: z.string().optional(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
})

export const AgentCall = z.object({
  agentName: z.string(),
  message: z.string(),
  threadId: z.string(),
  resourceId: z.string(),
  attachments: z.array(Attachment).optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  context: z.string().optional(),
})

export const AgentApproval = z.object({
  agentName: z.string(),
  runId: z.string(),
  approvals: z.array(
    z.object({ toolCallId: z.string(), approved: z.boolean() })
  ),
})

export const AgentResume = z.object({
  agentName: z.string(),
  runId: z.string(),
  toolCallId: z.string(),
  approved: z.boolean(),
})

export const ThreadsQuery = z.object({
  agentName: z.string().optional(),
  resourceId: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})

export const ThreadRef = z.object({
  threadId: z.string(),
  resourceId: z.string().optional(),
})

export const ThreadDeleted = z.object({ deleted: z.boolean() })
`

  const functions = `import {
  agentCallOptions,
  canAccessThread,
  threadOwnerConstraint,
} from '@pikku/core/agent'
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { pikkuPermission } from '${leaf('auth')}'
import { defineHTTPRoutes, wireHTTPRoutes } from '${leaf('http')}'
import {
  AgentCall,
  AgentApproval,
  AgentResume,
  ThreadsQuery,
  ThreadRef,
  ThreadDeleted,
} from './agent.schemas.gen.js'

/**
 * A unit without an agent does not require \`agentRunService\`, so it is typed
 * optional here and its absence is reported rather than dereferenced.
 */
const requireAgentRunService = <T>(services: { agentRunService?: T }): T => {
  if (!services.agentRunService) {
    throw new Error(
      'agentRunService is not configured — provide it in the singleton services to use agent threads'
    )
  }
  return services.agentRunService
}

/**
 * Thread reads are keyed by a caller-supplied \`threadId\`, so ownership cannot
 * come from the request — it is derived from the session and checked against
 * the stored thread's resourceId.
 */
export const isThreadOwner = pikkuPermission<{ threadId: string }>(
  async (services, { threadId }, { session }) => {
    const thread = await requireAgentRunService(services).getThread(threadId)
    // A missing thread is denied rather than 404'd so it is indistinguishable
    // from one owned by someone else — no existence oracle.
    if (!thread) return false
    return canAccessThread(thread.resourceId, session)
  }
)

export const agentCaller = pikkuSessionlessFunc({
  description: 'Run a named AI agent with a message and return its reply',
  tags: ['pikku'],
  auth: false,
  input: AgentCall,
  func: async (_services, data, { rpc }) => {
    return await rpc.exposedAgent.run(data.agentName, agentCallOptions(data))
  },
})

export const agentStreamCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: AgentCall,
  func: async (_services, data, { rpc }) => {
    await rpc.exposedAgent.stream(data.agentName, agentCallOptions(data))
  },
})

export const agentApproveCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: AgentApproval,
  func: async (_services, { runId, approvals, agentName }, { rpc }) => {
    return await rpc.exposedAgent.approve(runId, approvals, agentName)
  },
})

export const agentResumeCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: AgentResume,
  func: async (_services, data, { rpc }) => {
    await rpc.exposedAgent.resume(data.runId, {
      toolCallId: data.toolCallId,
      approved: data.approved,
      expectedAgentName: data.agentName,
    })
  },
})

export const getAgentThreads = pikkuSessionlessFunc({
  tags: ['pikku', 'pikku:agent'],
  input: ThreadsQuery,
  title: 'Get Agent Threads',
  description:
    'Returns the caller\\'s AI agent threads from storage. Accepts optional filters: agentName, resourceId, limit, and offset for pagination.',
  expose: true,
  auth: true,
  func: async (services, input, { session }) => {
    // \`owners\` is an authorization constraint derived from the session, never
    // from input — \`resourceId\` remains a caller-supplied filter within it.
    return await requireAgentRunService(services).listThreads({
      agentName: input?.agentName,
      resourceId: input?.resourceId,
      owners: threadOwnerConstraint(session),
      limit: input?.limit,
      offset: input?.offset,
    })
  },
})

export const getAgentThreadMessages = pikkuSessionlessFunc({
  tags: ['pikku', 'pikku:agent'],
  input: ThreadRef,
  title: 'Get Agent Thread Messages',
  description:
    'Returns all messages for a given AI agent thread, ordered by creation time.',
  expose: true,
  auth: true,
  permissions: { owner: isThreadOwner },
  func: async (services, input) => {
    return await requireAgentRunService(services).getThreadMessages(input.threadId)
  },
})

export const getAgentThreadRuns = pikkuSessionlessFunc({
  tags: ['pikku', 'pikku:agent'],
  input: ThreadRef,
  title: 'Get Agent Thread Runs',
  description:
    'Returns the run history for a given AI agent thread, ordered by creation time.',
  expose: true,
  auth: true,
  permissions: { owner: isThreadOwner },
  func: async (services, input) => {
    return await requireAgentRunService(services).getThreadRuns(input.threadId)
  },
})

export const deleteAgentThread = pikkuSessionlessFunc({
  tags: ['pikku', 'pikku:agent'],
  input: ThreadRef,
  output: ThreadDeleted,
  title: 'Delete Agent Thread',
  description:
    'Deletes an AI agent thread and all of its persisted state.',
  expose: true,
  auth: true,
  permissions: { owner: isThreadOwner },
  func: async (services, input) => {
    const deleted = await requireAgentRunService(services).deleteThread(input.threadId)
    return { deleted }
  },
})

export const agentRoutes = defineHTTPRoutes({
  auth: false,
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
      streamProtocol: 'agui',
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
      streamProtocol: 'agui',
      func: agentResumeCaller,
    },
  },
})

wireHTTPRoutes({ routes: { agent: agentRoutes } })
`

  return { schemas, functions }
}
