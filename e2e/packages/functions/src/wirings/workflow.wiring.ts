import { pikkuSessionlessFunc, wireHTTP } from '#pikku/pikku-types.gen.js'
import { graphStart } from '#pikku/workflow/pikku-workflow-types.gen.js'

const workflowRunner = pikkuSessionlessFunc<
  { workflowName: string; data?: any },
  unknown
>({
  auth: false,
  func: async (
    { workflowService, logger },
    { workflowName, data },
    { rpc }
  ) => {
    const { runId } = await rpc.startWorkflow(workflowName as any, data ?? {})
    logger.info(`Workflow ${workflowName} started: ${runId}`)

    const maxWaitMs = 30_000
    const pollIntervalMs = 500
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      const run = await workflowService!.getRun(runId)
      if (!run) throw new Error(`Run not found: ${runId}`)

      if (run.status === 'completed') {
        return { ...run.output, runId }
      }
      if (run.status === 'failed') {
        return { error: run.error, status: 'failed', runId }
      }
      if (run.status === 'cancelled') {
        return { error: run.error, status: 'cancelled', runId }
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }
    throw new Error(`Workflow timed out after ${maxWaitMs}ms`)
  },
})

wireHTTP({
  route: '/workflow/run',
  method: 'post',
  auth: false,
  func: workflowRunner,
})

const workflowStarter = pikkuSessionlessFunc<
  { workflowName: string; data?: any },
  { runId: string }
>({
  auth: false,
  func: async (_services, { workflowName, data }, { rpc }) => {
    return await rpc.startWorkflow(workflowName as any, data ?? {})
  },
})

wireHTTP({
  route: '/workflow/start',
  method: 'post',
  auth: false,
  func: workflowStarter,
})

const workflowStatusChecker = pikkuSessionlessFunc<
  { runId: string },
  { id: string; status: string; output?: any; error?: any }
>({
  auth: false,
  func: async ({ workflowService }, { runId }) => {
    const run = await workflowService!.getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    return {
      id: run.id,
      status: run.status,
      output: run.output,
      error: run.error,
    }
  },
})

wireHTTP({
  route: '/workflow/status',
  method: 'post',
  auth: false,
  func: workflowStatusChecker,
})

wireHTTP({
  route: '/workflow/graph-linear/start',
  method: 'post',
  auth: false,
  func: graphStart('graphLinearWorkflow', 'double'),
})

wireHTTP({
  route: '/workflow/graph-branching/start',
  method: 'post',
  auth: false,
  func: graphStart('graphBranchingWorkflow', 'assess'),
})

wireHTTP({
  route: '/workflow/graph-parallel/start',
  method: 'post',
  auth: false,
  func: graphStart('graphParallelWorkflow', 'start'),
})
