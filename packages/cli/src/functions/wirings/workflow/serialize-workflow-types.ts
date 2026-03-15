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
  pikkuWorkflowGraph as corePikkuWorkflowGraph,
  type PikkuWorkflowGraphConfig,
  type PikkuWorkflowGraphResult,
} from '@pikku/core/workflow'
import type { PikkuWorkflowWire, WorkflowStepOptions } from '@pikku/core/workflow'

export { WorkflowCancelledException }
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { FlattenedRPCMap } from '${rpcMapImportPath}'
import type { WorkflowMap, GraphsMap } from '${workflowMapImportPath}'

export { template }

export interface TypedWorkflow extends PikkuWorkflowWire {
  do<K extends keyof FlattenedRPCMap>(
    stepName: string,
    rpcName: K,
    data: FlattenedRPCMap[K]['input'],
    options?: WorkflowStepOptions
  ): Promise<FlattenedRPCMap[K]['output']>

  do<K extends keyof WorkflowMap>(
    stepName: string,
    workflowName: K,
    data: WorkflowMap[K]['input'],
    options?: WorkflowStepOptions
  ): Promise<WorkflowMap[K]['output']>

  do<T>(
    stepName: string,
    fn: () => T | Promise<T>,
    options?: WorkflowStepOptions
  ): Promise<T>
}

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { InferSchemaOutput, PikkuPermission, PikkuMiddleware, NodeConfig, PikkuApprovalDescription } from '${functionTypesImportPath}'
import { PikkuError } from '@pikku/core/errors'
import type { CorePermissionGroup } from '@pikku/core'

export type PikkuFunctionWorkflow<
  In = unknown,
  Out = never
> = PikkuFunctionSessionless<In, Out, 'workflow'>

export type PikkuWorkflowConfigWithSchema<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = {
  title?: string
  description?: string
  tags?: string[]
  expose?: boolean
  internal?: boolean
  override?: string
  version?: number
  remote?: boolean
  mcp?: boolean
  readonly?: boolean
  approvalRequired?: boolean
  approvalDescription?: InputSchema extends StandardSchemaV1 ? PikkuApprovalDescription<InferSchemaOutput<InputSchema>> : never
  func: PikkuFunctionWorkflow<
    InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown
  >
  auth?: boolean
  permissions?: InputSchema extends StandardSchemaV1 ? CorePermissionGroup<PikkuPermission<InferSchemaOutput<InputSchema>>> : undefined
  middleware?: PikkuMiddleware[]
  input?: InputSchema
  output?: OutputSchema
  node?: NodeConfig
  errors?: Array<typeof PikkuError>
}

export function pikkuWorkflowFunc<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuWorkflowConfigWithSchema<InputSchema, OutputSchema>
): PikkuFunctionConfig<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'workflow', PikkuFunctionWorkflow<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown>, InputSchema, OutputSchema>
export function pikkuWorkflowFunc<In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
): PikkuFunctionConfig<In, Out, 'workflow'>
export function pikkuWorkflowFunc(func: any) {
  return typeof func === 'function' ? { func } : func
}

export function pikkuWorkflowComplexFunc<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuWorkflowConfigWithSchema<InputSchema, OutputSchema>
): PikkuFunctionConfig<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'workflow', PikkuFunctionWorkflow<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown>, InputSchema, OutputSchema>
export function pikkuWorkflowComplexFunc<In, Out = unknown>(
  func:
    | PikkuFunctionWorkflow<In, Out>
    | PikkuFunctionConfig<In, Out, 'workflow', PikkuFunctionWorkflow<In, Out>>
): PikkuFunctionConfig<In, Out, 'workflow'>
export function pikkuWorkflowComplexFunc(func: any) {
  return typeof func === 'function' ? { func } : func
}

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

export function pikkuWorkflowGraph<
  const FuncMap extends Record<string, keyof FlattenedRPCMap & string>
>(
  config: PikkuWorkflowGraphConfig<FuncMap, GraphNodeConfigMap<FuncMap>>
): PikkuWorkflowGraphResult {
  return corePikkuWorkflowGraph(config as any)
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
