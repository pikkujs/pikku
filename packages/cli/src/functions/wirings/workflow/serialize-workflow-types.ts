/**
 * Generates type definitions for workflow wirings
 */
export const serializeWorkflowTypes = (functionTypesImportPath: string) => {
  return `/**
 * Workflow-specific type definitions for tree-shaking optimization
 */

import { PikkuWorkflowInteraction, WorkflowStepOptions } from '@pikku/core/workflow'
import { CorePikkuFunctionConfig, CorePikkuFunctionSessionless, PikkuInteraction, PickRequired } from '@pikku/core'
import type { PikkuPermission, PikkuMiddleware } from '${functionTypesImportPath}'
import type { UserSession, SingletonServices } from '../../types/application-types.d.js'
import type { TypedPikkuRPC, RPCMap } from '../rpc/pikku-rpc-wirings-map.internal.gen.d.js'

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
> = PikkuFunctionSessionless<
  In,
  Out,
  'workflow'
>

/**
 * Creates a workflow function with typed input and output.
 * Workflow functions have access to the workflow interaction object for step execution.
 *
 * This is the permissive mode - workflows that don't conform to simple DSL will fall back
 * to basic extraction with a warning.
 *
 * @template In - Input type for the workflow
 * @template Out - Output type for the workflow
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 */
export const pikkuWorkflowFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<PikkuFunctionWorkflow<In, Out>, PikkuPermission<In>, PikkuMiddleware>
) => {
  return typeof func === 'function' ? { func } : func
}

/**
 * Creates a simple workflow function with typed input and output.
 * Simple workflows must conform to the restricted DSL for static analysis.
 *
 * This is the strict mode - workflows that don't conform to simple DSL will cause
 * a critical error during inspection.
 *
 * Constraints:
 * - Must use only workflow.do() with RPC form (no inline functions)
 * - Only if/else, for..of, and Promise.all(array.map()) control flow allowed
 * - Step names must be unique (except across mutually exclusive branches)
 * - All workflow calls must be awaited
 *
 * @template In - Input type for the workflow
 * @template Out - Output type for the workflow
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 */
export const pikkuSimpleWorkflowFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<PikkuFunctionWorkflow<In, Out>, PikkuPermission<In>, PikkuMiddleware>
) => {
  return typeof func === 'function' ? { func } : func
}

`
}
