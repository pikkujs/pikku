import type { PikkuRPC } from '../rpc/rpc-types.js'
import { runFromMeta } from './graph/graph-runner.js'
import type { PikkuWorkflowService } from './pikku-workflow-service.js'
import type { WorkflowRun } from './workflow.types.js'

/**
 * Resume a run whose workflow changed since it started. A graph workflow
 * resumes from the version it started on; a complex one, whose inline steps
 * cannot be replayed against a different definition, fails.
 */
export const runVersionMismatchFallback = async (
  service: PikkuWorkflowService,
  run: WorkflowRun,
  currentMeta: { source: string },
  rpcService: PikkuRPC
): Promise<void> => {
  // What can be resumed depends on the version the run started on, not on what
  // the workflow has since become. The current source only stands in when that
  // version was never stored.
  const version = await service.getWorkflowVersion(run.workflow, run.graphHash!)
  const source = version?.source ?? currentMeta.source

  if (source === 'complex') {
    await service.updateRunStatus(run.id, 'failed', undefined, {
      message: `Workflow '${run.workflow}' definition changed. Complex workflows with inline steps cannot be migrated.`,
      stack: '',
      code: 'VERSION_CONFLICT',
    })
    return
  }

  if (!version) {
    await service.updateRunStatus(run.id, 'failed', undefined, {
      message: `Workflow '${run.workflow}' version '${run.graphHash}' not found. Cannot resume with changed definition.`,
      stack: '',
      code: 'VERSION_NOT_FOUND',
    })
    return
  }

  await runFromMeta(service, run.id, version.graph, rpcService)
}
