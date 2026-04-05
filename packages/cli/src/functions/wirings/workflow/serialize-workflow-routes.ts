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

function assertWorkflowService(workflowService: unknown): asserts workflowService {
  if (!workflowService) throw new MissingServiceError('workflowService is required')
}

export const workflowStarter = pikkuSessionlessFunc<
  { workflowName: string; [key: string]: unknown },
  { runId: string }
>({
  auth: ${authFlag},
  func: async (_services, { workflowName, ...data }, { rpc }) => {
    return await rpc.startWorkflow(workflowName as any, data)
  },
})

export const workflowRunner = pikkuSessionlessFunc<
  { workflowName: string; [key: string]: unknown },
  unknown
>({
  auth: ${authFlag},
  func: async ({ workflowService }, { workflowName, ...data }, { rpc }) => {
    assertWorkflowService(workflowService)
    return await workflowService.runToCompletion(workflowName, data, rpc)
  },
})

export const workflowStatusChecker = pikkuSessionlessFunc<
  { workflowName: string; runId: string },
  { id: string; status: string; output?: unknown; error?: { message?: string } }
>({
  auth: ${authFlag},
  func: async ({ workflowService }, { runId }) => {
    assertWorkflowService(workflowService)
    const run = await workflowService.getRun(runId)
    if (!run) throw new Error(\`Run not found: \${runId}\`)
    return {
      id: run.id,
      status: run.status,
      output: run.output,
      error: run.error ? { message: run.error.message } : undefined,
    }
  },
})

export const graphStarter = pikkuSessionlessFunc<
  { workflowName: string; nodeId: string; [key: string]: unknown },
  { runId: string }
>({
  auth: ${authFlag},
  func: async (_services, { workflowName, nodeId, ...data }, { rpc }) => {
    return await rpc.startWorkflow(workflowName as any, data, { startNode: nodeId })
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
    graphStart: {
      route: '/workflow/:workflowName/graph/:nodeId',
      method: 'post',
      func: graphStarter,
    },
  },
})
`
}
