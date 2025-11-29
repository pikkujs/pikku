/**
 * Generate all workflow type helpers for authoring workflows
 * Combines DSL helpers (pikkuWorkflowFunc, pikkuWorkflowComplexFunc) and
 * graph helpers (pikkuWorkflowGraph) with unified wireWorkflow
 */
export const serializeWorkflowTypes = (
  functionTypesImportPath: string,
  rpcMapImportPath: string
) => {
  return `/**
 * Workflow type definitions and helpers
 * Used for authoring both DSL and graph-based workflows
 */

import { PikkuWorkflowWire, WorkflowStepOptions, WorkflowWires } from '@pikku/core/workflow'
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { RPCMap, FlattenedRPCMap } from '${rpcMapImportPath}'
import type { GraphNodeConfig } from '@pikku/core'
import { createGraph, wireWorkflow as coreWireWorkflow } from '@pikku/core'

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
// Graph Workflow Types (pikkuWorkflowGraph)
// ============================================================================

/**
 * Type-safe graph builder with full RPC autocomplete
 */
const graphBuilder = createGraph<FlattenedRPCMap>()

/** Type for the graph builder function */
type GraphBuilder = typeof graphBuilder

/** Configuration for graph-based workflow */
export interface PikkuWorkflowGraphConfig<T> {
  /** Workflow name */
  name: string
  /** Optional description */
  description?: string
  /** Optional tags for organization */
  tags?: string[]
  /** Graph definition callback */
  graph: (graph: GraphBuilder) => T
}

/** Result of pikkuWorkflowGraph - includes metadata for wiring */
export interface PikkuWorkflowGraphResult<T> {
  __type: 'pikkuWorkflowGraph'
  name: string
  description?: string
  tags?: string[]
  graph: T
}

/**
 * Creates a graph-based workflow definition with metadata
 *
 * @example
 * export const myGraphWorkflow = pikkuWorkflowGraph({
 *   name: 'myWorkflow',
 *   description: 'Handles user onboarding',
 *   tags: ['onboarding'],
 *   graph: (graph) =>
 *     graph({
 *       entry: 'createUser',
 *       sendEmail: 'sendWelcomeEmail',
 *     })({
 *       entry: { next: 'sendEmail' },
 *       sendEmail: { input: (ref) => ({ to: ref('entry', 'email') }) },
 *     }),
 * })
 */
export function pikkuWorkflowGraph<
  T extends Record<string, GraphNodeConfig<Extract<keyof T, string>>>
>(
  config: PikkuWorkflowGraphConfig<T>
): PikkuWorkflowGraphResult<T> {
  return {
    __type: 'pikkuWorkflowGraph',
    name: config.name,
    description: config.description,
    tags: config.tags,
    graph: config.graph(graphBuilder),
  }
}

// ============================================================================
// Unified wireWorkflow
// ============================================================================

/** Workflow definition with DSL function */
interface WorkflowDefinitionFunc {
  wires: WorkflowWires
  func: ReturnType<typeof pikkuWorkflowFunc> | ReturnType<typeof pikkuWorkflowComplexFunc>
}

/** Workflow definition with graph */
interface WorkflowDefinitionGraph<T> {
  wires: WorkflowWires
  graph: PikkuWorkflowGraphResult<T>
}

/**
 * Wire a workflow with wires
 * Accepts either a DSL function (func) or a graph definition (graph)
 *
 * @example
 * // DSL workflow
 * wireWorkflow({
 *   wires: { http: { route: '/start', method: 'post' } },
 *   func: myWorkflowFunc,
 * })
 *
 * // Graph workflow
 * wireWorkflow({
 *   wires: { http: { route: '/graph-start', method: 'post' } },
 *   graph: myGraphWorkflow,
 * })
 */
export function wireWorkflow<T extends Record<string, GraphNodeConfig<Extract<keyof T, string>>>>(
  definition: WorkflowDefinitionFunc | WorkflowDefinitionGraph<T>
): void {
  coreWireWorkflow(definition as any)
}
`
}
