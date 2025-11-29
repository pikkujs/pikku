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

import { PikkuWorkflowWire, WorkflowStepOptions, WorkflowCancelledException } from '@pikku/core/workflow'

// Re-export WorkflowCancelledException for use in workflow functions
export { WorkflowCancelledException }
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { RPCMap, FlattenedRPCMap } from '${rpcMapImportPath}'
import type { GraphNodeConfig, HTTPMethod } from '@pikku/core'
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

/** HTTP wire configuration for graph workflows */
interface GraphHttpWire<NodeIds extends string> {
  route: string
  method: HTTPMethod
  startNode: NodeIds
}

/** Channel wire configuration for graph workflows */
interface GraphChannelWire<NodeIds extends string> {
  name: string
  onConnect?: NodeIds
  onDisconnect?: NodeIds
  onMessage?: NodeIds
}

/** Queue wire configuration for graph workflows */
interface GraphQueueWire<NodeIds extends string> {
  name: string
  startNode: NodeIds
}

/** CLI wire configuration for graph workflows */
interface GraphCliWire<NodeIds extends string> {
  command: string
  startNode: NodeIds
}

/** MCP wire configurations for graph workflows */
interface GraphMcpWires<NodeIds extends string> {
  tool?: Array<{ name: string; startNode: NodeIds }>
  prompt?: Array<{ name: string; startNode: NodeIds }>
  resource?: Array<{ uri: string; startNode: NodeIds }>
}

/** Schedule wire configuration for graph workflows */
interface GraphScheduleWire<NodeIds extends string> {
  cron?: string
  interval?: string
  startNode: NodeIds
}

/** Trigger wire configuration for graph workflows */
interface GraphTriggerWire<NodeIds extends string> {
  name: string  // RPC name of the trigger function
  startNode: NodeIds
}

/** All wire configurations for graph workflows */
interface GraphWiresConfig<NodeIds extends string> {
  http?: Array<GraphHttpWire<NodeIds>>
  channel?: Array<GraphChannelWire<NodeIds>>
  queue?: Array<GraphQueueWire<NodeIds>>
  cli?: Array<GraphCliWire<NodeIds>>
  mcp?: GraphMcpWires<NodeIds>
  schedule?: Array<GraphScheduleWire<NodeIds>>
  trigger?: Array<GraphTriggerWire<NodeIds>>
}

/** Configuration for graph-based workflow */
export interface PikkuWorkflowGraphConfig<
  FuncMap extends Record<string, keyof FlattenedRPCMap & string>,
  T
> {
  /** Workflow name (optional - defaults to exported variable name) */
  name?: string
  /** Optional description */
  description?: string
  /** Optional tags for organization */
  tags?: string[]
  /** Node to RPC function mapping */
  nodes: FuncMap
  /** Wire configurations - how this workflow can be triggered */
  wires?: GraphWiresConfig<Extract<keyof FuncMap, string>>
  /** Node configurations (next, input, onError) */
  config?: T
}

/** Result of pikkuWorkflowGraph - includes metadata for wiring */
export interface PikkuWorkflowGraphResult<T, NodeIds extends string = string> {
  __type: 'pikkuWorkflowGraph'
  name?: string
  description?: string
  tags?: string[]
  wires?: GraphWiresConfig<NodeIds>
  graph: T
}

/**
 * Creates a graph-based workflow definition with metadata
 * Name defaults to the exported variable name if not provided.
 *
 * @example
 * // Name inferred from exported variable name
 * export const myWorkflow = pikkuWorkflowGraph({
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
): PikkuWorkflowGraphResult<Record<Extract<keyof FuncMap, string>, GraphNodeConfig<Extract<keyof FuncMap, string>>>, Extract<keyof FuncMap, string>> {
  return {
    __type: 'pikkuWorkflowGraph',
    name: config.name,
    description: config.description,
    tags: config.tags,
    wires: config.wires,
    graph: graphBuilder(config.nodes, config.config as any),
  }
}

/** Compute output types for all nodes based on their RPC mapping */
type ComputeNodeOutputs<FuncMap extends Record<string, string>> = {
  [K in keyof FuncMap]: FuncMap[K] extends keyof FlattenedRPCMap
    ? FlattenedRPCMap[FuncMap[K]]['output']
    : unknown
}

/** Compute input types for all nodes based on their RPC mapping */
type ComputeNodeInputs<FuncMap extends Record<string, string>> = {
  [K in keyof FuncMap]: FuncMap[K] extends keyof FlattenedRPCMap
    ? FlattenedRPCMap[FuncMap[K]]['input']
    : unknown
}

/** Typed ref value */
type TypedRef<T> = { $ref: string; path?: string } & { __phantomType?: T }

/** Map input type fields to allow TypedRef of matching type */
type InputWithRefs<T> = {
  [K in keyof T]: T[K] | TypedRef<T[K]>
}

/** Type helper for node configuration */
type GraphNodeConfigMap<FuncMap extends Record<string, string>> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    input?: (
      ref: <
        N extends Extract<keyof FuncMap, string>,
        P extends keyof ComputeNodeOutputs<FuncMap>[N] & string
      >(
        nodeId: N,
        path: P
      ) => TypedRef<ComputeNodeOutputs<FuncMap>[N][P]>
    ) => InputWithRefs<ComputeNodeInputs<FuncMap>[K]>
    onError?: Extract<keyof FuncMap, string> | Extract<keyof FuncMap, string>[]
  }
}

type NextConfig<NodeIds extends string> = NodeIds | NodeIds[] | { if: string; then: NodeIds; else?: NodeIds }

// ============================================================================
// Unified wireWorkflow
// ============================================================================

/** Workflow definition with DSL function */
interface WorkflowDefinitionFunc {
  /** Whether this workflow wiring is enabled (default: true) */
  enabled?: boolean
  /** Wire configurations for the workflow */
  wires: {
    http?: { route: string; method: HTTPMethod }
    channel?: string
    queue?: string
  }
  /** DSL workflow function */
  func: ReturnType<typeof pikkuWorkflowFunc> | ReturnType<typeof pikkuWorkflowComplexFunc>
}

/** Workflow definition with graph */
interface WorkflowDefinitionGraph<T, NodeIds extends string = string> {
  /** Whether this workflow wiring is enabled (default: true) */
  enabled?: boolean
  /** Graph workflow definition - wires are defined in the graph itself */
  graph: PikkuWorkflowGraphResult<T, NodeIds>
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
 * @example
 * // Graph workflow - wires are defined in the graph itself
 * wireWorkflow({
 *   enabled: true,  // default: true
 *   graph: myGraphWorkflow,
 * })
 */
export function wireWorkflow<T extends Record<string, GraphNodeConfig<Extract<keyof T, string>>>, NodeIds extends string = string>(
  definition: WorkflowDefinitionFunc | WorkflowDefinitionGraph<T, NodeIds>
): void {
  coreWireWorkflow(definition as any)
}
`
}
