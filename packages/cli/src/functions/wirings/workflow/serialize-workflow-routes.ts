export interface WorkflowRoutesGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate catch-all HTTP routes for workflow operations
 */
export const serializeWorkflowRoutes = (
  leaf: (name: string) => string
): WorkflowRoutesGenOutput => {
  const schemas = `/**
 * Auto-generated workflow route schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const WorkflowStart = z.object({
  workflowName: z.string(),
  data: z.unknown().optional(),
})

export const WorkflowRunRef = z.object({
  workflowName: z.string(),
  runId: z.string(),
})

export const WorkflowRunId = z.object({ runId: z.string() })

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
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { wireHTTPRoutes } from '${leaf('http')}'
import { MissingServiceError } from '@pikku/core/errors'
import {
  checkWorkflowRunAccess,
  checkWorkflowStart,
  streamWorkflowRunStatus,
} from '@pikku/core/workflow'
import {
  WorkflowStart,
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

/**
 * The routes stay dumb: a workflow is a function, and its own declaration says
 * who may call it. Session optional here; the check is the workflow's.
 */
export const workflowStarter = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: WorkflowStart,
  output: WorkflowRunId,
  // workflowService is destructured (even though we delegate via rpc) so the
  // analyzer assigns workflow-state capability to this unit — without it,
  // rpc.startWorkflow() runs against a container missing workflowService.
  func: async ({ workflowService }, { workflowName, data }, wire) => {
    assertWorkflowService(workflowService)
    const start = await checkWorkflowStart(workflowName, data ?? {}, wire)
    return await wire.rpc.startWorkflow(workflowName as any, start.input as any, {
      wire: start.wire,
    })
  },
})

export const workflowRunner = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: WorkflowStart,
  func: async ({ workflowService }, { workflowName, data }, wire) => {
    assertWorkflowService(workflowService)
    const start = await checkWorkflowStart(workflowName, data ?? {}, wire)
    return await workflowService.runToCompletion(workflowName, start.input, wire.rpc, {
      wire: start.wire,
    })
  },
})

export const workflowStatusChecker = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: WorkflowRunRef,
  func: async ({ workflowService }, { workflowName, runId }, wire) => {
    assertWorkflowService(workflowService)
    const run = await workflowService.getRun(runId)
    await checkWorkflowRunAccess(workflowName, run, wire, 'read')
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
  auth: false,
  input: WorkflowRunRef,
  func: async ({ workflowRunService }, { workflowName, runId }, wire) => {
    assertWorkflowRunService(workflowRunService)
    if (!wire.channel) return
    await streamWorkflowRunStatus({
      workflowRunService,
      workflowName,
      runId,
      channel: wire.channel,
      wire,
    })
  },
})

/**
 * Full workflow status stream — includes output, error, and child run IDs.
 * Same check as the minimal stream: a run with an owner is only for that owner.
 */
export const workflowStatusStreamFull = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: WorkflowRunRef,
  func: async ({ workflowRunService }, { workflowName, runId }, wire) => {
    assertWorkflowRunService(workflowRunService)
    if (!wire.channel) return
    await streamWorkflowRunStatus({
      workflowRunService,
      workflowName,
      runId,
      channel: wire.channel,
      wire,
      detailed: true,
    })
  },
})

/**
 * Record a human decision against a workflow.approval() gate and wake the run.
 *
 * Only an \`expose: true\` workflow can be answered here, only for its own runs,
 * and only by a signed-in caller its \`auth\` and permissions accept.
 *
 * The decision is validated on replay inside the workflow body — the only place
 * the approval's schema value is in scope — so this route deliberately accepts
 * an unknown payload. An invalid one re-closes the gate rather than failing the
 * request.
 *
 * WHO may approve is the gate's own business, declared with
 * \`approvers\`/\`approverScope\` on \`workflow.approval()\`, and enforced in two
 * places. Once the run has reached the gate it has published its policy, so this
 * route judges the caller against it and refuses with a 403. A decision arriving
 * before the gate has no policy to judge against yet, so it is accepted here and
 * judged on replay instead, where failing discards the decision and leaves the
 * gate closed. A caller sees either outcome depending on that timing.
 */
export const workflowApprover = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: WorkflowApproval,
  output: Acknowledged,
  // See workflowStarter — destructure workflowService so the analyzer
  // assigns workflow-state capability to this unit.
  func: async ({ workflowService }, { workflowName, runId, reason, decision }, wire) => {
    assertWorkflowService(workflowService)
    const run = await workflowService.getRun(runId)
    await checkWorkflowRunAccess(workflowName, run, wire, 'approve')
    await workflowService.approveStep(runId, reason, decision, wire.session)
    return { ok: true as const }
  },
})

wireHTTPRoutes({
  tags: ['pikku'],
  auth: false,
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
  },
})
`

  return { schemas, functions }
}
