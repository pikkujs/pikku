/**
 * Generate catch-all HTTP routes for workflow operations
 */
export const serializeWorkflowRoutes = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `/**
 * Workflow HTTP catch-all routes
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTPRoutes } from '${pathToPikkuTypes}'
import { MissingServiceError } from '@pikku/core/errors'
import type { WorkflowRunStatus } from '@pikku/core/workflow'

function assertWorkflowService(workflowService: unknown): asserts workflowService {
  if (!workflowService) throw new MissingServiceError('workflowService is required')
}

export const workflowStarter = pikkuSessionlessFunc<
  { workflowName: string; data?: unknown },
  { runId: string }
>({
  auth: ${authFlag},
  func: async (_services, { workflowName, data }, { rpc }) => {
    return await rpc.startWorkflow(workflowName as any, data ?? {})
  },
})

export const workflowRunner = pikkuSessionlessFunc<
  { workflowName: string; data?: unknown },
  unknown
>({
  auth: ${authFlag},
  func: async ({ workflowService }, { workflowName, data }, { rpc }) => {
    assertWorkflowService(workflowService)
    return await workflowService.runToCompletion(workflowName, data ?? {}, rpc)
  },
})

export const workflowStatusChecker = pikkuSessionlessFunc<
  { workflowName: string; runId: string },
  WorkflowRunStatus
>({
  auth: ${authFlag},
  func: async ({ workflowService }, { runId }) => {
    assertWorkflowService(workflowService)
    const status = await workflowService.getRunStatus(runId)
    if (!status) throw new Error(\`Run not found: \${runId}\`)
    return status
  },
})

export const workflowStatusStream = pikkuSessionlessFunc<
  { workflowName: string; runId: string },
  WorkflowRunStatus
>({
  auth: ${authFlag},
  func: async ({ workflowService }, { runId }, { channel }) => {
    assertWorkflowService(workflowService)
    const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
    const pollIntervalMs = 1000
    const maxWaitMs = 300_000

    const startTime = Date.now()
    let lastStatusJson = ''

    while (Date.now() - startTime < maxWaitMs) {
      const status = await workflowService.getRunStatus(runId)
      if (!status) throw new Error(\`Run not found: \${runId}\`)

      const statusJson = JSON.stringify(status)
      if (statusJson !== lastStatusJson) {
        lastStatusJson = statusJson
        if (channel) {
          channel.send(status)
        }
      }

      if (terminalStatuses.has(status.status)) {
        if (channel) {
          channel.close()
        }
        return status
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }

    // Timeout — return last known status
    const finalStatus = await workflowService.getRunStatus(runId)
    if (channel) {
      channel.close()
    }
    return finalStatus as WorkflowRunStatus
  },
})

export const graphStarter = pikkuSessionlessFunc<
  { workflowName: string; nodeId: string; data?: unknown },
  { runId: string }
>({
  auth: ${authFlag},
  func: async (_services, { workflowName, nodeId, data }, { rpc }) => {
    return await rpc.startWorkflow(workflowName as any, data ?? {}, { startNode: nodeId })
  },
})

wireHTTPRoutes({
  auth: ${authFlag},
  routes: {
    workflowStart: {
      route: '/workflow/:workflowName/start',
      method: 'post',
      func: workflowStarter,
    },
    workflowRun: {
      route: '/workflow/:workflowName/run',
      method: 'post',
      func: workflowRunner,
    },
    workflowStatus: {
      route: '/workflow/:workflowName/status/:runId',
      method: 'get',
      func: workflowStatusChecker,
    },
    workflowStatusStream: {
      route: '/workflow/:workflowName/status/:runId/stream',
      method: 'get',
      sse: true,
      func: workflowStatusStream,
    },
    graphStart: {
      route: '/workflow/:workflowName/graph/:nodeId',
      method: 'post',
      func: graphStarter,
    },
  },
})
`
}
