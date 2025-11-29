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
// Graph Workflow Types (wireWorkflowGraph)
// ============================================================================

/**
 * Type-safe graph builder with full RPC autocomplete
 */
const graph = createGraph<FlattenedRPCMap>()

/** Type for the graph builder function */
type GraphBuilder = typeof graph

/**
 * Definition returned by the callback
 */
interface WorkflowGraphCallbackDefinition<T> {
  name: string
  triggers: WorkflowGraphTriggers
  graph: T
}

/**
 * Type-safe wireWorkflowGraph with RPC-aware graph definition
 * The graph builder is passed as a callback parameter for cleaner API
 *
 * @example
 * wireWorkflowGraph((graph) => ({
 *   name: 'myWorkflow',
 *   triggers: { http: { route: '/start', method: 'post' } },
 *   graph: graph({
 *     entry: 'createUser',
 *     sendEmail: 'sendWelcomeEmail',
 *   })({
 *     entry: { next: 'sendEmail' },
 *     sendEmail: { input: (ref) => ({ to: ref('entry', 'email') }) },
 *   }),
 * }))
 */
export function wireWorkflowGraph<
  T extends Record<string, GraphNodeConfig<Extract<keyof T, string>>>
>(
  callback: (graph: GraphBuilder) => WorkflowGraphCallbackDefinition<T>
): void {
  const definition = callback(graph)
  coreWireWorkflowGraph(definition)
}
`
}
