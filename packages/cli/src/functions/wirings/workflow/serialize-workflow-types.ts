/**
 * Generates type definitions for workflow wirings
 */
export const serializeWorkflowTypes = (
  functionTypesImportPath: string,
  rpcMapImportPath: string
) => {
  return `/**
 * Workflow-specific type definitions for tree-shaking optimization
 */

import { PikkuWorkflowWire, WorkflowStepOptions } from '@pikku/core/workflow'
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { RPCMap } from '${rpcMapImportPath}'

/**
 * Typed workflow wire with RPC awareness
 * Provides type-safe workflow.do() for RPC steps
 */
export interface TypedWorkflow extends PikkuWorkflowWire {
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
 * Includes the workflow wire object with typed RPC methods
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
 * Workflow functions have access to the workflow wire object for step execution.
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
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
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
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
) => {
  return typeof func === 'function' ? { func } : func
}

`
}
