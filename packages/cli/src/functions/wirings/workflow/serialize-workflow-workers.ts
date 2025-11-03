import type { workflowsMeta, WorkflowStepMeta } from '@pikku/core/workflow'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * Generate queue workers for workflow steps and orchestrator
 *
 * For each workflow, generates:
 * 1. RPC step workers (one per RPC form step)
 * 2. Orchestrator worker (one per workflow)
 */
export const serializeWorkflowWorkers = (
  outputPath: string,
  workflowTypesPath: string,
  packageMappings: Record<string, string>,
  workflowsMeta: workflowsMeta
) => {
  const imports: string[] = []
  const workers: string[] = []

  imports.push("import { wireQueueWorker } from '@pikku/core/queue'")
  imports.push("import { pikkuFunc } from '@pikku/core'")
  imports.push("import { runWorkflowJob } from '@pikku/core/workflow'")

  const workflowTypesImport = getFileImportRelativePath(
    outputPath,
    workflowTypesPath,
    packageMappings
  )

  // Generate workers for each workflow
  for (const [workflowName, workflowMeta] of Object.entries(workflowsMeta)) {
    const { meta } = workflowMeta

    // Generate RPC step workers
    const rpcSteps = meta.steps.filter(
      (step): step is Extract<WorkflowStepMeta, { type: 'rpc' }> =>
        step.type === 'rpc' && step.stepName !== '<dynamic>'
    )

    for (const step of rpcSteps) {
      const queueName = `workflow-${workflowName}-${step.stepName}`
      const workerComment =
        step.description && step.description !== '<dynamic>'
          ? `  // ${step.description}`
          : `  // RPC step: ${step.stepName}`

      workers.push(`
${workerComment}
wireQueueWorker({
  queueName: '${queueName}',
  func: pikkuFunc(async ({ rpc, workflowState, queue }, payload: any) => {
    const { runId, stepName, rpcName, data } = payload

    // Idempotency check - skip if already done
    const stepState = await workflowState.getStepState(runId, stepName)
    if (stepState.status === 'done') {
      return
    }

    try {
      // Execute RPC
      const result = await rpc.invoke(rpcName, data)

      // Store result
      await workflowState.setStepResult(runId, stepName, result)

      // Trigger orchestrator to continue workflow
      await queue.add('workflow-${workflowName}-orchestrator', { runId })
    } catch (error: any) {
      // Store error
      await workflowState.setStepError(runId, stepName, error)

      // Mark workflow as failed
      await workflowState.updateRunStatus(runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })

      throw error
    }
  }),
})
`)
    }

    // Generate orchestrator worker
    const orchestratorComment = workflowMeta.description
      ? `  // Orchestrator for: ${workflowMeta.description}`
      : `  // Orchestrator for ${workflowName} workflow`

    workers.push(`
${orchestratorComment}
wireQueueWorker({
  queueName: 'workflow-${workflowName}-orchestrator',
  func: pikkuFunc(async ({ workflowState, queue }, payload: any) => {
    const { runId } = payload

    try {
      // Run workflow job (replays with caching)
      await runWorkflowJob(runId, { workflowState, queue } as any)
    } catch (error: any) {
      // WorkflowAsyncException is not an error - it means we scheduled a step
      if (error.name === 'WorkflowAsyncException') {
        // Workflow paused waiting for step completion
        return
      }

      // Real error - mark workflow as failed
      await workflowState.updateRunStatus(runId, 'failed', undefined, {
        message: error.message,
        stack: error.stack,
        code: error.code,
      })

      throw error
    }
  }),
})
`)
  }

  return `/**
 * Auto-generated workflow queue workers
 *
 * This file contains:
 * - RPC step workers (one per RPC form step)
 * - Orchestrator workers (one per workflow)
 *
 * Do not edit manually - regenerate with 'npx pikku prebuild'
 */

${imports.join('\n')}

${workers.join('\n')}
`
}
