export interface WorkflowRoutesGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate catch-all HTTP routes for workflow operations.
 *
 * Emitted as two files. The schemas are zod, and the inspector reads a zod
 * schema by importing the module that declares it — which it cannot do for the
 * wiring file, whose relative pikku-types import per-unit deploy codegen
 * rewrites. Keeping the schemas in a sibling module that imports nothing but
 * zod sidesteps that entirely.
 *
 * The status and stream results get no zod `output`: a run's status is a
 * `@pikku/core` type and the streams push over the channel rather than
 * returning, so in both cases the handler's own return type already says it and
 * a second declaration here would only be free to drift.
 */
export const serializeWorkflowRoutes = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
): WorkflowRoutesGenOutput => {
  const authFlag = requireAuth ? 'true' : 'false'

  const schemas = `/**
 * Auto-generated workflow route schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

/** Starting a run: \`data\` is the workflow's own input, validated by it. */
export const WorkflowStart = z.object({
  workflowName: z.string(),
  data: z.unknown().optional(),
})

/** Starting a graph run from one node rather than the graph's entry point. */
export const GraphStart = z.object({
  workflowName: z.string(),
  nodeId: z.string(),
  data: z.unknown().optional(),
})

/** One run of one workflow. */
export const WorkflowRunRef = z.object({
  workflowName: z.string(),
  runId: z.string(),
})

export const WorkflowRunId = z.object({ runId: z.string() })

/**
 * A human decision against a workflow.approval() gate. \`decision\` is
 * deliberately unconstrained — see workflowApprover.
 */
export const WorkflowApproval = z.object({
  workflowName: z.string(),
  runId: z.string(),
  reason: z.string(),
  decision: z.unknown(),
})

export const Acknowledged = z.object({ ok: z.literal(true) })
`

  const functions = `/**
 * Workflow HTTP catch-all routes
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTPRoutes } from '${pathToPikkuTypes}'
import { MissingServiceError } from '@pikku/core/errors'
import {
  WorkflowStart,
  GraphStart,
  WorkflowRunRef,
  WorkflowRunId,
  WorkflowApproval,
  Acknowledged,
} from './workflow-routes.schemas.gen.js'

function assertWorkflowService(workflowService: unknown): asserts workflowService {
  if (!workflowService) throw new MissingServiceError('workflowService is required')
}

function assertWorkflowRunService(workflowRunService: unknown): asserts workflowRunService {
  if (!workflowRunService) throw new MissingServiceError('workflowRunService is required')
}

export const workflowStarter = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: WorkflowStart,
  output: WorkflowRunId,
  // workflowService is destructured (even though we delegate via rpc) so the
  // analyzer assigns workflow-state capability to this unit — without it,
  // rpc.startWorkflow() runs against a container missing workflowService.
  func: async ({ workflowService }, { workflowName, data }, { rpc }) => {
    assertWorkflowService(workflowService)
    return await rpc.startWorkflow(workflowName as any, (data ?? {}) as any)
  },
})

export const workflowRunner = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: WorkflowStart,
  func: async ({ workflowService }, { workflowName, data }, { rpc }) => {
    assertWorkflowService(workflowService)
    return await workflowService.runToCompletion(workflowName, data ?? {}, rpc)
  },
})

export const workflowStatusChecker = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: WorkflowRunRef,
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
export const workflowStatusStream = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: WorkflowRunRef,
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
export const workflowStatusStreamFull = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: WorkflowRunRef,
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

export const graphStarter = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: GraphStart,
  output: WorkflowRunId,
  // See workflowStarter — destructure workflowService so the analyzer
  // assigns workflow-state capability to this unit.
  func: async ({ workflowService }, { workflowName, nodeId, data }, { rpc }) => {
    assertWorkflowService(workflowService)
    return await rpc.startWorkflow(workflowName as any, (data ?? {}) as any, { startNode: nodeId })
  },
})

/**
 * Record a human decision against a workflow.approval() gate and wake the run.
 *
 * The decision is validated on replay inside the workflow body — the only place
 * the approval's schema value is in scope — so this route deliberately accepts
 * an unknown payload. An invalid one re-closes the gate rather than failing the
 * run. Gate this route with your own auth/permissions to control WHO may
 * approve: the framework does not model approver identity.
 */
export const workflowApprover = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: WorkflowApproval,
  output: Acknowledged,
  // See workflowStarter — destructure workflowService so the analyzer
  // assigns workflow-state capability to this unit.
  func: async ({ workflowService }, { runId, reason, decision }) => {
    assertWorkflowService(workflowService)
    await workflowService.approveStep(runId, reason, decision)
    return { ok: true as const }
  },
})

wireHTTPRoutes({
  tags: ['pikku'],
  auth: ${authFlag},
  routes: {
    workflowStart: {
      route: '/workflow/:workflowName/start',
      method: 'post',
      func: workflowStarter,
    },
    workflowApprove: {
      route: '/workflow/:workflowName/approve/:runId',
      method: 'post',
      func: workflowApprover,
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

  return { schemas, functions }
}
