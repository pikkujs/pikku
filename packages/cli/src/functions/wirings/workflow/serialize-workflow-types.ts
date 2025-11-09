/**
 * Generates type definitions for workflow wirings
 */
export const serializeWorkflowTypes = (functionTypesImportPath: string) => {
  return `/**
 * Workflow-specific type definitions for tree-shaking optimization
 */

import { CoreWorkflow, wireWorkflow as wireWorkflowCore, PikkuWorkflowInteraction, WorkflowStepOptions } from '@pikku/core/workflow'
import { CorePikkuFunctionConfig, CorePikkuFunctionSessionless } from '@pikku/core'
import type { PikkuPermission, PikkuMiddleware } from '${functionTypesImportPath}'
import type { UserSession, SingletonServices } from '../../types/application-types.d.js'
import type { TypedPikkuRPC, RPCMap } from '../rpc/pikku-rpc-wirings-map.internal.gen.d.js'

/**
 * Type definition for workflows that orchestrate multi-step processes.
 * Workflows support both inline and remote execution modes with step caching.
 */
type WorkflowWiring = CoreWorkflow<
  CorePikkuFunctionConfig<PikkuFunctionWorkflow<any, any>, PikkuPermission<any>, PikkuMiddleware>
>

/**
 * Typed workflow interaction with RPC awareness
 * Provides type-safe workflow.do() for RPC steps
 */
export interface TypedWorkflow extends PikkuWorkflowInteraction {
  /**
   * Execute a workflow step with RPC invocation (typed based on available RPCs)
   * @template K - RPC name from the RPC map
   */
  do<K extends keyof RPCMap>(
    stepName: string,
    rpcName: K,
    data: RPCMap[K]['input'],
    options?: WorkflowStepOptions
  ): Promise<RPCMap[K]['output']>

  /**
   * Execute a workflow step with inline function
   * @template T - Return type of the inline function
   */
  do<T>(
    stepName: string,
    fn: () => T | Promise<T>,
    options?: WorkflowStepOptions
  ): Promise<T>
}

/**
 * Workflow function type with typed workflow service
 * Includes the workflow interaction object with typed RPC methods
 */
export type PikkuFunctionWorkflow<
  In = unknown,
  Out = never
> = CorePikkuFunctionSessionless<
  In,
  Out,
  null,
  SingletonServices & {
    rpc: TypedPikkuRPC
    workflow: TypedWorkflow
  },
  UserSession
>

/**
 * Creates a workflow function with typed input and output.
 * Workflow functions have access to the workflow interaction object for step execution.
 *
 * @template In - Input type for the workflow
 * @template Out - Output type for the workflow
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 */
export const pikkuWorkflowFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | CorePikkuFunctionConfig<PikkuFunctionWorkflow<In, Out>, PikkuPermission<In>, PikkuMiddleware>
) => {
  return typeof func === 'function' ? { func } : func
}

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
