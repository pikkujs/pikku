/**
 * Generate all workflow type helpers for authoring workflows
 * Combines DSL helpers (pikkuWorkflowFunc, pikkuWorkflowComplexFunc) and
 * graph helpers (pikkuWorkflowGraph) with unified wireWorkflow
 */
export const serializeWorkflowTypes = (
  functionTypesImportPath: string,
  rpcMapImportPath: string,
  workflowMapImportPath: string
) => {
  return `/**
 * Workflow type definitions and helpers
 * Used for authoring both DSL and graph-based workflows
 */

import { PikkuWorkflowWire, WorkflowStepOptions, WorkflowCancelledException, WorkflowRunNotFoundError } from '@pikku/core/workflow'

// Re-export WorkflowCancelledException for use in workflow functions
export { WorkflowCancelledException }
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { RPCMap, FlattenedRPCMap } from '${rpcMapImportPath}'
import type { WorkflowMap, GraphsMap } from '${workflowMapImportPath}'
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
  disabled?: true
  /** Workflow name (optional - defaults to exported variable name) */
  name?: string
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
  name?: string
  description?: string
  tags?: string[]
  graph: T
}


/** Typed ref value */
type TypedRef<T> = { $ref: string; path?: string } & { __phantomType?: T }

/** Template string type - assignable to string fields */
type TemplateString = {
  $template: {
    parts: string[]
    expressions: Array<{ $ref: string; path?: string }>
  }
} & { __brand: 'TemplateString' }

/**
 * Creates a template string with variable interpolation
 * Uses indexed placeholders $0, $1, etc. with refs array
 *
 * @example
 * template('Hello $0, your order $1 is ready', [ref('trigger', 'name'), ref('step_0', 'orderId')])
 */
export function template(templateStr: string, refs: TypedRef<unknown>[]): TemplateString {
  const parts: string[] = []
  const expressions: Array<{ $ref: string; path?: string }> = []

  // Parse template string: "Hello $0" -> parts: ["Hello ", ""], use refs[0] for expression
  const regex = /\\$(\\d+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(templateStr)) !== null) {
    // Add the part before this match
    parts.push(templateStr.slice(lastIndex, match.index))

    // Get the ref by index
    const refIndex = parseInt(match[1]!, 10)
    const refValue = refs[refIndex]
    if (refValue) {
      const expr: { $ref: string; path?: string } = { $ref: refValue.$ref }
      if (refValue.path) {
        expr.path = refValue.path
      }
      expressions.push(expr)
    } else {
      expressions.push({ $ref: 'unknown' })
    }

    lastIndex = regex.lastIndex
  }

  // Add the remaining part
  parts.push(templateStr.slice(lastIndex))

  return {
    $template: { parts, expressions }
  } as TemplateString
}

/** Map input type fields to allow TypedRef or TemplateString for any field */
type InputWithRefs<T> = {
  [K in keyof T]?: T[K] | TypedRef<T[K]> | TypedRef<unknown> | TemplateString
}

/** Get the input type for a node based on its RPC mapping */
type NodeInputType<FuncMap extends Record<string, string>, K extends keyof FuncMap> =
  FuncMap[K] extends keyof FlattenedRPCMap
    ? InputWithRefs<FlattenedRPCMap[FuncMap[K]]['input']>
    : Record<string, unknown>

/** Get the output type keys for a node based on its RPC mapping */
type NodeOutputKeys<FuncMap extends Record<string, string>, N extends string> =
  N extends keyof FuncMap
    ? FuncMap[N] extends keyof FlattenedRPCMap
      ? keyof FlattenedRPCMap[FuncMap[N]]['output'] & string
      : string
    : string

/** Ref function type with path validation */
type RefFunction<FuncMap extends Record<string, string>> = {
  <N extends Extract<keyof FuncMap, string>>(
    nodeId: N,
    path: NodeOutputKeys<FuncMap, N>
  ): TypedRef<unknown>
  (nodeId: 'trigger' | '$item', path?: string): TypedRef<unknown>
}

/** Template function type */
type TemplateFunction = (templateStr: string, refs: TypedRef<unknown>[]) => TemplateString

/** Type helper for node configuration */
type GraphNodeConfigMap<FuncMap extends Record<string, string>> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    input?:
      | NodeInputType<FuncMap, K>
      | (() => NodeInputType<FuncMap, K>)
      | ((ref: RefFunction<FuncMap>, template: TemplateFunction) => NodeInputType<FuncMap, K>)
    onError?: Extract<keyof FuncMap, string> | Extract<keyof FuncMap, string>[]
  }
}

type NextConfig<NodeIds extends string> = NodeIds | NodeIds[] | { if: string; then: NodeIds; else?: NodeIds }

// ============================================================================
// wireWorkflow (DSL) + wireWorkflowGraph (Graph)
// ============================================================================

/** Workflow definition with DSL function */
interface WorkflowDefinitionFunc {
  disabled?: true
  /** DSL workflow function */
  func: PikkuFunctionConfig<any, any, 'workflow', PikkuFunctionWorkflow<any, any>>
}

export function wireWorkflow(definition: WorkflowDefinitionFunc): void {
  coreWireWorkflow(definition as any)
}

export function wireWorkflowGraph<
  const FuncMap extends Record<string, keyof FlattenedRPCMap & string>
>(
  config: PikkuWorkflowGraphConfig<FuncMap, GraphNodeConfigMap<FuncMap>>
): PikkuWorkflowGraphResult<Record<Extract<keyof FuncMap, string>, GraphNodeConfig<Extract<keyof FuncMap, string>>>> {
  const result: PikkuWorkflowGraphResult<Record<Extract<keyof FuncMap, string>, GraphNodeConfig<Extract<keyof FuncMap, string>>>> = {
    __type: 'pikkuWorkflowGraph',
    name: config.name,
    description: config.description,
    tags: config.tags,
    graph: graphBuilder(config.nodes, config.config as any),
  }
  if (!config.disabled) {
    coreWireWorkflow({ graph: result } as any)
  }
  return result
}

// ============================================================================
// Workflow & Graph HTTP helpers
// ============================================================================

export const workflow = <Name extends keyof WorkflowMap>(
  workflowName: Name,
  options?: { pollIntervalMs?: number }
): PikkuFunctionConfig<
  WorkflowMap[Name]['input'],
  WorkflowMap[Name]['output'],
  'session' | 'rpc'
> => {
  return {
    func: (async (services: any, data: any, { rpc }: any) => {
      return services.workflowService.runToCompletion(workflowName, data, rpc, options)
    }) as any
  } as PikkuFunctionConfig<
    WorkflowMap[Name]['input'],
    WorkflowMap[Name]['output'],
    'session' | 'rpc'
  >
}

export const workflowStart = <Name extends keyof WorkflowMap>(
  workflowName: Name
): PikkuFunctionConfig<
  WorkflowMap[Name]['input'],
  { runId: string },
  'session' | 'rpc'
> => {
  return {
    func: (async (_services: any, data: any, { rpc }: any) => {
      return rpc.startWorkflow(workflowName, data)
    }) as any
  } as PikkuFunctionConfig<
    WorkflowMap[Name]['input'],
    { runId: string },
    'session' | 'rpc'
  >
}

export const workflowStatus = <Name extends keyof WorkflowMap>(
  _workflowName: Name
): PikkuFunctionConfig<
  { runId: string },
  { id: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; output?: WorkflowMap[Name]['output']; error?: { message?: string } },
  'session' | 'rpc'
> => {
  return {
    func: (async (services: any, data: any) => {
      const run = await services.workflowService.getRun(data.runId)
      if (!run) {
        throw new WorkflowRunNotFoundError(data.runId)
      }
      return {
        id: run.id,
        status: run.status,
        output: run.output,
        error: run.error ? { message: run.error.message } : undefined,
      }
    }) as any
  } as PikkuFunctionConfig<
    { runId: string },
    { id: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; output?: WorkflowMap[Name]['output']; error?: { message?: string } },
    'session' | 'rpc'
  >
}

export const graphStart = <Name extends keyof GraphsMap, Node extends string & keyof GraphsMap[Name]>(
  graphName: Name,
  startNode: Node
): PikkuFunctionConfig<
  GraphsMap[Name][Node] extends { input: infer I } ? I : never,
  { runId: string },
  'session' | 'rpc'
> => {
  return {
    func: (async (_services: any, data: any, { rpc }: any) => {
      return rpc.startWorkflow(graphName, data, { startNode })
    }) as any
  } as PikkuFunctionConfig<
    GraphsMap[Name][Node] extends { input: infer I } ? I : never,
    { runId: string },
    'session' | 'rpc'
  >
}
`
}
