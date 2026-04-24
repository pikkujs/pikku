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

function assertWorkflowRunService(workflowRunService: unknown): asserts workflowRunService {
  if (!workflowRunService) throw new MissingServiceError('workflowRunService is required')
}

export const workflowStarter = pikkuSessionlessFunc<
  { workflowName: string; data?: unknown },
  { runId: string }
>({
  auth: ${authFlag},
  func: async (_services, { workflowName, data }, { rpc }) => {
    return await rpc.startWorkflow(workflowName as any, (data ?? {}) as any)
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

/**
 * Minimal workflow status stream — sends step names and statuses only.
 * Use this for user-facing frontends where internal details should not be exposed.
 */
export const workflowStatusStream = pikkuSessionlessFunc<
  { workflowName: string; runId: string },
  unknown
>({
  auth: ${authFlag},
  func: async ({ workflowRunService }, { runId }, { channel }) => {
    assertWorkflowRunService(workflowRunService)
    if (!channel) return

    const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
    let lastHash = ''
    let initSent = false

    const poll = async () => {
      const run = await workflowRunService.getRun(runId)
      if (!run) {
        channel.close()
        return false
      }

      const steps = await workflowRunService.getRunSteps(runId)

      if (!initSent && run.deterministic) {
        const statusByStep = new Map(
          steps.map((s: { stepName: string; status: string }) => [
            s.stepName,
            s.status,
          ])
        )
        channel.send({
          type: 'init',
          deterministic: true,
          steps: (run.plannedSteps ?? []).map(
            (s: { stepName: string }) => ({
              stepName: s.stepName,
              status: statusByStep.get(s.stepName) ?? 'pending',
            })
          ),
        })
        initSent = true
      }

      const hash = JSON.stringify({
        s: run.status,
        steps: steps.map((s: { stepName: string; status: string }) => [s.stepName, s.status]),
      })

      if (hash !== lastHash) {
        lastHash = hash
        channel.send({
          type: 'update',
          status: run.status,
          steps: steps.map((s: { stepName: string; status: string }) => ({
            stepName: s.stepName,
            status: s.status,
          })),
        })
      }

      if (terminalStatuses.has(run.status)) {
        channel.send({ type: 'done' })
        channel.close()
        return false
      }
      return true
    }

    const shouldContinue = await poll()
    if (!shouldContinue) return

    await new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const cont = await poll()
        if (!cont) {
          clearInterval(interval)
          resolve()
        }
      }, 500)
    })
  },
})

/**
 * Full workflow status stream — includes output, error, and child run IDs.
 * Use this for admin consoles and internal tooling.
 */
export const workflowStatusStreamFull = pikkuSessionlessFunc<
  { workflowName: string; runId: string },
  unknown
>({
  auth: ${authFlag},
  func: async ({ workflowRunService }, { runId }, { channel }) => {
    assertWorkflowRunService(workflowRunService)
    if (!channel) return

    const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
    let lastHash = ''
    let initSent = false

    const poll = async () => {
      const run = await workflowRunService.getRun(runId)
      if (!run) {
        channel.close()
        return false
      }

      const steps = await workflowRunService.getRunSteps(runId)

      if (!initSent && run.deterministic) {
        const statusByStep = new Map(
          steps.map((s: { stepName: string; status: string }) => [
            s.stepName,
            s.status,
          ])
        )
        channel.send({
          type: 'init',
          deterministic: true,
          steps: (run.plannedSteps ?? []).map(
            (s: { stepName: string }) => ({
              stepName: s.stepName,
              status: statusByStep.get(s.stepName) ?? 'pending',
            })
          ),
        })
        initSent = true
      }

      const hash = JSON.stringify({
        s: run.status,
        o: run.output,
        steps: steps.map((s: { stepName: string; status: string }) => [s.stepName, s.status]),
      })

      if (hash !== lastHash) {
        lastHash = hash
        channel.send({
          type: 'update',
          status: run.status,
          output: run.output,
          error: run.error,
          steps: steps.map((s: { stepName: string; status: string; childRunId?: string }) => ({
            stepName: s.stepName,
            status: s.status,
            ...(s.childRunId ? { childRunId: s.childRunId } : {}),
          })),
        })
      }

      if (terminalStatuses.has(run.status)) {
        channel.send({ type: 'done' })
        channel.close()
        return false
      }
      return true
    }

    const shouldContinue = await poll()
    if (!shouldContinue) return

    await new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        const cont = await poll()
        if (!cont) {
          clearInterval(interval)
          resolve()
        }
      }, 500)
    })
  },
})

export const graphStarter = pikkuSessionlessFunc<
  { workflowName: string; nodeId: string; data?: unknown },
  { runId: string }
>({
  auth: ${authFlag},
  func: async (_services, { workflowName, nodeId, data }, { rpc }) => {
    return await rpc.startWorkflow(workflowName as any, (data ?? {}) as any, { startNode: nodeId })
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
    workflowStatusStreamFull: {
      route: '/workflow/:workflowName/status/:runId/stream/full',
      method: 'get',
      sse: true,
      func: workflowStatusStreamFull,
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
