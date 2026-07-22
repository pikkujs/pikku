export interface PublicAgentGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the public HTTP surface for AI agents.
 *
 * Emitted as two files. The schemas are zod, and the inspector reads a zod
 * schema by importing the module that declares it — which it cannot do for the
 * wiring file, whose relative pikku-types import per-unit deploy codegen
 * rewrites. Keeping the schemas in a sibling module that imports nothing but
 * zod sidesteps that entirely.
 *
 * The run and stream calls share one `AgentCall` schema. That used to be
 * impossible: a TS type literal had to be repeated verbatim in each generic
 * position, because behind a named alias the extractor recorded an
 * `inputSchemaName` with no schema behind it and every agent call failed at
 * runtime with MissingSchemaError. A zod `input` is resolved by reference and
 * named after the function, so one schema can back several functions.
 *
 * Thread reads return rows straight from `agentRunService`, so they carry no
 * zod `output` — the handler's own return type already says what they are.
 */
export const serializePublicAgent = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true,
  globalHTTPPrefix: string = ''
): PublicAgentGenOutput => {
  const authFlag = requireAuth ? 'true' : 'false'

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

/** One turn against a named agent, run or streamed. */
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

/** A batch of decisions on the tool calls a run is waiting on. */
export const AgentApproval = z.object({
  agentName: z.string(),
  runId: z.string(),
  approvals: z.array(
    z.object({ toolCallId: z.string(), approved: z.boolean() })
  ),
})

/** A single decision, resuming a run that paused on one tool call. */
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

/**
 * \`resourceId\` is carried for the caller's convenience only — ownership is
 * checked against the stored thread, never against this field.
 */
export const ThreadRef = z.object({
  threadId: z.string(),
  resourceId: z.string().optional(),
})

export const ThreadDeleted = z.object({ deleted: z.boolean() })
`

  const functions = `import { canAccessThread, threadOwnerConstraint } from '@pikku/core/ai-agent'
import { pikkuSessionlessFunc, pikkuPermission, defineHTTPRoutes, wireHTTPRoutes } from '${pathToPikkuTypes}'
import {
  AgentCall,
  AgentApproval,
  AgentResume,
  ThreadsQuery,
  ThreadRef,
  ThreadDeleted,
} from './agent.schemas.gen.js'

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

export const agentCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: AgentCall,
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

export const agentStreamCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: AgentCall,
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

export const agentApproveCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: AgentApproval,
  func: async (_services, { runId, approvals, agentName }, { rpc }) => {
    return await rpc.agent.approve(runId, approvals, agentName)
  },
})

export const agentResumeCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: AgentResume,
  func: async (_services, data, { rpc }) => {
    await rpc.agent.resume(data.runId, {
      toolCallId: data.toolCallId,
      approved: data.approved,
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

export const getAgentThreadMessages = pikkuSessionlessFunc({
  tags: ['pikku', 'pikku:agent'],
  input: ThreadRef,
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

export const getAgentThreadRuns = pikkuSessionlessFunc({
  tags: ['pikku', 'pikku:agent'],
  input: ThreadRef,
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

export const deleteAgentThread = pikkuSessionlessFunc({
  tags: ['pikku', 'pikku:agent'],
  input: ThreadRef,
  output: ThreadDeleted,
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

  return { schemas, functions }
}
