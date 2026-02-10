export const serializeWorkflowTypes = (
  functionTypesImportPath: string,
  rpcMapImportPath: string,
  workflowMapImportPath: string
) => {
  return `import { WorkflowCancelledException } from '@pikku/core/workflow'
import {
  workflow as coreWorkflow,
  workflowStart as coreWorkflowStart,
  workflowStatus as coreWorkflowStatus,
  graphStart as coreGraphStart,
} from '@pikku/core/workflow'
import { template } from '@pikku/core/workflow'
import {
  wireWorkflowGraph as coreWireWorkflowGraph,
  type PikkuWorkflowGraphConfig,
  type PikkuWorkflowGraphResult,
} from '@pikku/core/workflow'
import type { PikkuWorkflowWire, WorkflowStepOptions } from '@pikku/core/workflow'

export { WorkflowCancelledException }
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { RPCMap, FlattenedRPCMap } from '${rpcMapImportPath}'
import type { WorkflowMap, GraphsMap } from '${workflowMapImportPath}'
import type { GraphNodeConfig } from '@pikku/core'
import { createGraph, wireWorkflow as coreWireWorkflow } from '@pikku/core'

export { template }

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

export type PikkuFunctionWorkflow<
  In = unknown,
  Out = never
> = PikkuFunctionSessionless<In, Out, 'workflow'>

export const pikkuWorkflowFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
) => {
  return typeof func === 'function' ? { func } : func
}

export const pikkuWorkflowComplexFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
) => {
  return typeof func === 'function' ? { func } : func
}

const graphBuilder = createGraph<FlattenedRPCMap>()

type TypedRef<T> = { $ref: string; path?: string } & { __phantomType?: T }

type TemplateString = {
  $template: {
    parts: string[]
    expressions: Array<{ $ref: string; path?: string }>
  }
} & { __brand: 'TemplateString' }

type InputWithRefs<T> = {
  [K in keyof T]?: T[K] | TypedRef<T[K]> | TypedRef<unknown> | TemplateString
}

type NodeInputType<FuncMap extends Record<string, string>, K extends keyof FuncMap> =
  FuncMap[K] extends keyof FlattenedRPCMap
    ? InputWithRefs<FlattenedRPCMap[FuncMap[K]]['input']>
    : Record<string, unknown>

type NodeOutputKeys<FuncMap extends Record<string, string>, N extends string> =
  N extends keyof FuncMap
    ? FuncMap[N] extends keyof FlattenedRPCMap
      ? keyof FlattenedRPCMap[FuncMap[N]]['output'] & string
      : string
    : string

type RefFunction<FuncMap extends Record<string, string>> = {
  <N extends Extract<keyof FuncMap, string>>(
    nodeId: N,
    path: NodeOutputKeys<FuncMap, N>
  ): TypedRef<unknown>
  (nodeId: 'trigger' | '$item', path?: string): TypedRef<unknown>
}

type TemplateFunction = (templateStr: string, refs: TypedRef<unknown>[]) => TemplateString

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

interface WorkflowDefinitionFunc {
  disabled?: true
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
  return coreWireWorkflowGraph(graphBuilder as any, config as any) as any
}

export const workflow = <Name extends keyof WorkflowMap>(
  workflowName: Name,
  options?: { pollIntervalMs?: number }
) => {
  return coreWorkflow<WorkflowMap>(workflowName as string & keyof WorkflowMap, options) as PikkuFunctionConfig<
    WorkflowMap[Name]['input'],
    WorkflowMap[Name]['output'],
    'session' | 'rpc'
  >
}

export const workflowStart = <Name extends keyof WorkflowMap>(
  workflowName: Name
) => {
  return coreWorkflowStart<WorkflowMap>(workflowName as string & keyof WorkflowMap) as PikkuFunctionConfig<
    WorkflowMap[Name]['input'],
    { runId: string },
    'session' | 'rpc'
  >
}

export const workflowStatus = <Name extends keyof WorkflowMap>(
  _workflowName: Name
) => {
  return coreWorkflowStatus<WorkflowMap>(_workflowName as string & keyof WorkflowMap) as PikkuFunctionConfig<
    { runId: string },
    { id: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; output?: WorkflowMap[Name]['output']; error?: { message?: string } },
    'session' | 'rpc'
  >
}

export const graphStart = <Name extends keyof GraphsMap, Node extends string & keyof GraphsMap[Name]>(
  graphName: Name,
  startNode: Node
) => {
  return coreGraphStart<GraphsMap>(graphName as string & keyof GraphsMap, startNode as string) as PikkuFunctionConfig<
    GraphsMap[Name][Node] extends { input: infer I } ? I : never,
    { runId: string },
    'session' | 'rpc'
  >
}
`
}
