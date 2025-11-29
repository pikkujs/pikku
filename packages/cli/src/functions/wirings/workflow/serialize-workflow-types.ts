/**
 * Generate all workflow type helpers for authoring workflows
 * Combines DSL helpers (pikkuWorkflowFunc, pikkuWorkflowComplexFunc) and
 * graph helpers (graph, wireWorkflowGraph) into one file
 */
export const serializeWorkflowTypes = (
  functionTypesImportPath: string,
  rpcMapImportPath: string
) => {
  return `/**
 * Workflow type definitions and helpers
 * Used for authoring both DSL and graph-based workflows
 */

import { PikkuWorkflowWire, WorkflowStepOptions } from '@pikku/core/workflow'
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { RPCMap, FlattenedRPCMap } from '${rpcMapImportPath}'
import type { GraphNodeConfig, WorkflowGraphTriggers } from '@pikku/core'
import { createGraph, wireWorkflowGraph as coreWireWorkflowGraph } from '@pikku/core'

// ============================================================================
// DSL Workflow Types (pikkuWorkflowFunc, pikkuWorkflowComplexFunc)
// ============================================================================

/**
 * Typed workflow wire with RPC awareness
 * Provides type-safe workflow.do() for RPC steps
 */
export interface TypedWorkflow extends PikkuWorkflowWire {
  do<K extends keyof RPCMap>(
    stepName: string,
    rpcName: K,
    data: RPCMap[K]['input'],
    options?: WorkflowStepOptions
  ): Promise<RPCMap[K]['output']>

  do<T>(
    stepName: string,
    fn: () => T | Promise<T>,
    options?: WorkflowStepOptions
  ): Promise<T>
}

/**
 * Workflow function type with typed workflow service
 */
export type PikkuFunctionWorkflow<
  In = unknown,
  Out = never
> = PikkuFunctionSessionless<In, Out, 'workflow'>

/**
 * Creates a DSL-compatible workflow function (serializable, shows in Forge UI)
 */
export const pikkuWorkflowFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
) => {
  return typeof func === 'function' ? { func } : func
}

/**
 * Creates a complex workflow function (arbitrary code, hidden from Forge UI)
 */
export const pikkuWorkflowComplexFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
) => {
  return typeof func === 'function' ? { func } : func
}

// ============================================================================
// Graph Workflow Types (graph, wireWorkflowGraph)
// ============================================================================

/**
 * Type-safe graph builder with full RPC autocomplete
 */
export const graph = createGraph<FlattenedRPCMap>()

/**
 * Type-safe wireWorkflowGraph with RPC-aware graph definition
 */
export function wireWorkflowGraph<
  T extends Record<string, GraphNodeConfig<Extract<keyof T, string>>>
>(definition: {
  name: string
  triggers: WorkflowGraphTriggers
  graph: T
}): void {
  coreWireWorkflowGraph(definition)
}
`
}
