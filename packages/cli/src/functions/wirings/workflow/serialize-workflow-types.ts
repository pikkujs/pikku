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

/** Configuration for graph-based workflow */
export interface PikkuWorkflowGraphConfig<
  FuncMap extends Record<string, keyof FlattenedRPCMap & string>,
  T
> {
  /** Workflow name */
  name: string
  /** Optional description */
  description?: string
  /** Optional tags for organization */
  tags?: string[]
  /** Node to RPC function mapping */
  nodes: FuncMap
  /** Node configurations (next, input, onError) */
  config?: T
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
 *   nodes: {
 *     entry: 'createUser',
 *     sendEmail: 'sendWelcomeEmail',
 *   },
 *   config: {
 *     entry: { next: 'sendEmail' },
 *     sendEmail: { input: (ref) => ({ to: ref('entry', 'email') }) },
 *   },
 * })
 */
export function pikkuWorkflowGraph<
  const FuncMap extends Record<string, keyof FlattenedRPCMap & string>
>(
  config: PikkuWorkflowGraphConfig<FuncMap, GraphNodeConfigMap<FuncMap>>
): PikkuWorkflowGraphResult<Record<Extract<keyof FuncMap, string>, GraphNodeConfig<Extract<keyof FuncMap, string>>>> {
  return {
    __type: 'pikkuWorkflowGraph',
    name: config.name,
    description: config.description,
    tags: config.tags,
    graph: graphBuilder(config.nodes, config.config as any),
  }
}

/** Type helper for node configuration */
type GraphNodeConfigMap<FuncMap extends Record<string, string>> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    input?: (
      ref: <
        N extends Extract<keyof FuncMap, string>,
        P extends string
      >(
        nodeId: N,
        path: P
      ) => any
    ) => any
    onError?: Extract<keyof FuncMap, string> | Extract<keyof FuncMap, string>[]
  }
}

type NextConfig<NodeIds extends string> = NodeIds | NodeIds[] | { if: string; then: NodeIds; else?: NodeIds }

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
