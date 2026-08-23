import { sharedWorkflowConfigFields } from './serialize-scenario-types.js'

export const serializeWorkflowTypes = (
  functionTypesImportPath: string,
  middlewareTypesImportPath: string,
  authTypesImportPath: string,
  rpcMapImportPath: string,
  workflowMapImportPath: string,
  agentMapImportPath: string,
  scopesImportPath: string
) => {
  return `import { WorkflowCancelledException } from '@pikku/core/workflow'
import { pikkuWorkflowGraph as corePikkuWorkflowGraph } from '@pikku/core/workflow'
import type {
  PikkuWorkflowGraphConfig,
  PikkuWorkflowGraphResult,
} from '@pikku/core/workflow'
import type {
  PikkuWorkflowWire,
  WorkflowStepOptions,
} from '@pikku/core/workflow'

export { WorkflowCancelledException }
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { FlattenedRPCMap } from '${rpcMapImportPath}'
import type { FlattenedWorkflowMap } from '${workflowMapImportPath}'
import type { AgentMap as FlattenedAgentMap } from '${agentMapImportPath}'

/**
 * The wire a workflow step is handed: \`step\` to run one durably, plus sleeping,
 * waiting for a signal and asking for approval.
 */
export interface TypedWorkflow extends PikkuWorkflowWire {
  do<K extends keyof FlattenedRPCMap>(
    stepName: string,
    rpcName: K,
    data: FlattenedRPCMap[K]['input'],
    options?: WorkflowStepOptions
  ): Promise<FlattenedRPCMap[K]['output']>

  do<K extends keyof FlattenedWorkflowMap>(
    stepName: string,
    workflowName: K,
    data: FlattenedWorkflowMap[K]['input'],
    options?: WorkflowStepOptions
  ): Promise<FlattenedWorkflowMap[K]['output']>

  do<T>(
    stepName: string,
    fn: () => T | Promise<T>,
    options?: WorkflowStepOptions
  ): Promise<T>
}

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { InferSchemaOutput, NodeConfig, PikkuApprovalDescription } from '${functionTypesImportPath}'
import type { PikkuPermission } from '${authTypesImportPath}'
import type { PikkuMiddleware } from '${middlewareTypesImportPath}'
import type { ScopeId } from '${scopesImportPath}'
import { PikkuError } from '@pikku/core/errors'
import type { CorePermissionGroup } from '@pikku/core/function'

/**
 * The shape of a workflow's body — services, input, and the workflow wire.
 */
export type PikkuFunctionWorkflow<
  In = unknown,
  Out = never
> = PikkuFunctionSessionless<In, Out, 'workflow'>

type PikkuWorkflowConfigWithSchema<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = {
${sharedWorkflowConfigFields}
  func: PikkuFunctionWorkflow<
    InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown
  >
  auth?: boolean
  /**
   * Scopes the session must hold to run this workflow. All of them are required
   * (AND), and they are checked before \`permissions\`.
   */
  scopes?: ScopeId[]
  permissions?: InputSchema extends StandardSchemaV1 ? CorePermissionGroup<PikkuPermission<InferSchemaOutput<InputSchema>>> : undefined
}

/**
 * Declares a workflow: the DSL form, where each step is awaited in order and
 * the runner persists progress between them so a restart resumes rather than
 * replays. The default choice for a workflow.
 *
 * @example snippet: workflowSteps
 */
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

/**
 * Declares a workflow whose control flow the DSL cannot express - a loop whose
 * bound is only known at runtime, or branching that rejoins. An escape hatch:
 * reach for \`pikkuWorkflowFunc\` unless the shape genuinely needs this.
 *
 * @example snippet: workflowComplexFunc
 */
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
    : FuncMap[K] extends keyof FlattenedWorkflowMap
      ? InputWithRefs<FlattenedWorkflowMap[FuncMap[K]]['input']>
      : Record<string, unknown>

type NodeOutputKeys<FuncMap extends Record<string, string>, N extends string> =
  N extends keyof FuncMap
    ? FuncMap[N] extends keyof FlattenedRPCMap
      ? keyof FlattenedRPCMap[FuncMap[N]]['output'] & string
      : FuncMap[N] extends keyof FlattenedWorkflowMap
        ? keyof FlattenedWorkflowMap[FuncMap[N]]['output'] & string
        : FuncMap[N] extends keyof FlattenedAgentMap
          ? keyof FlattenedAgentMap[FuncMap[N]]['output'] & string
          : string
    : string

type RefFunction<FuncMap extends Record<string, string>> = {
  <N extends Extract<keyof FuncMap, string>>(
    nodeId: N,
    path: NodeOutputKeys<FuncMap, N>
  ): TypedRef<unknown>
  <N extends Extract<keyof FuncMap, string>>(nodeId: N): TypedRef<unknown>
  (nodeId: 'trigger' | '$item', path?: string): TypedRef<unknown>
}

type TemplateFunction = (templateStr: string, refs: TypedRef<unknown>[]) => TemplateString

type ItemFunction = (path?: string) => TypedRef<unknown>

type ForEachConfig<FuncMap extends Record<string, string>> =
  | Extract<keyof FuncMap, string>
  | ((ref: RefFunction<FuncMap>) => TypedRef<unknown>)

type GraphNodeConfigMap<FuncMap extends Record<string, string>> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    /** Run this node once per element of an upstream array. Its result becomes the ordered array of per-item results. */
    forEach?: ForEachConfig<FuncMap>
    /** How the per-item instances of a forEach node run. Defaults to 'parallel'. */
    mode?: 'parallel' | 'sequential'
    input?:
      | NodeInputType<FuncMap, K>
      | (() => NodeInputType<FuncMap, K>)
      | ((ref: RefFunction<FuncMap>, template: TemplateFunction, $item: ItemFunction) => NodeInputType<FuncMap, K>)
    onError?: Extract<keyof FuncMap, string> | Extract<keyof FuncMap, string>[]
    /** Free-text node documentation. Non-semantic — excluded from graphHash. */
    notes?: string
  }
}

type NextConfig<NodeIds extends string> = NodeIds | NodeIds[] | { if: string; then: NodeIds; else?: NodeIds }

/**
 * Declares a workflow as an explicit node graph, for a genuine cyclic
 * dependency or a Node-only import the DSL cannot carry. The last resort of the
 * three.
 *
 * @example snippet: workflowGraph
 */
export function pikkuWorkflowGraph<
  const FuncMap extends Record<
    string,
    | (keyof FlattenedRPCMap & string)
    | (keyof FlattenedWorkflowMap & string)
    | (keyof FlattenedAgentMap & string)
  >
>(
  config: PikkuWorkflowGraphConfig<FuncMap, GraphNodeConfigMap<FuncMap>>
): PikkuWorkflowGraphResult {
  return corePikkuWorkflowGraph(config as any)
}

`
}
