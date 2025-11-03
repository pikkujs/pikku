/**
 * Generates type definitions for workflow wirings
 */
export const serializeWorkflowTypes = (functionTypesImportPath: string) => {
  return `/**
 * Workflow-specific type definitions for tree-shaking optimization
 */

import { CoreWorkflow, wireWorkflow as wireWorkflowCore } from '@pikku/core/workflow'
import type { PikkuFunctionConfig, PikkuMiddleware } from '${functionTypesImportPath}'

/**
 * Type definition for workflows that orchestrate multi-step processes.
 * Workflows support both inline and remote execution modes with step caching.
 */
type WorkflowWiring = CoreWorkflow<PikkuFunctionConfig<any, any>, PikkuMiddleware>

/**
 * Registers a workflow with the Pikku framework.
 * Workflows can run in 'inline' (synchronous) or 'remote' (queue-based) execution modes.
 *
 * @param workflow - Workflow definition with name, execution mode, and handler function
 */
export const wireWorkflow = (workflow: WorkflowWiring) => {
  wireWorkflowCore(workflow as any)
}
`
}
