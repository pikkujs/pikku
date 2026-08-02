export const serializeWorkflowTypes = (
  functionTypesImportPath: string,
  rpcMapImportPath: string,
  workflowMapImportPath: string,
  agentMapImportPath: string,
  scopesImportPath: string,
  scenarioStepMapImportPath: string = './pikku-scenario-step-map.gen.js',
  scenarioActorsImportPath: string = './pikku-scenario-actors.gen.js'
) => {
  return `import { WorkflowCancelledException } from '@pikku/core/workflow'
import { template } from '@pikku/core/workflow'
import {
  pikkuWorkflowGraph as corePikkuWorkflowGraph,
  type PikkuWorkflowGraphConfig,
  type PikkuWorkflowGraphResult,
} from '@pikku/core/workflow'
import type { PikkuWorkflowWire, PikkuScenarioWire, WorkflowStepOptions, ScenarioStepOptions } from '@pikku/core/workflow'

export { WorkflowCancelledException }
import type { PikkuFunctionSessionless, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { FlattenedRPCMap } from '${rpcMapImportPath}'
import type { FlattenedWorkflowMap } from '${workflowMapImportPath}'
import type { AgentMap as FlattenedAgentMap } from '${agentMapImportPath}'
import type { FlattenedScenarioStepMap } from '${scenarioStepMapImportPath}'
import type { TypedScenarioActors } from '${scenarioActorsImportPath}'

export type { TypedScenarioActors }

export { template }

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

/**
 * The typed half of a scenario wire: \`step\` and its \`given\`/\`when\`/\`then\`
 * sugar, narrowed to the names declared by \`pikkuScenarioStep\` in this project.
 * The phase only changes the prose the reporter renders.
 */
export interface TypedScenarioSteps {
  step<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>

  given<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>

  when<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>

  then<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>
}

export type TypedScenario = TypedWorkflow &
  Omit<PikkuScenarioWire, keyof PikkuWorkflowWire | keyof TypedScenarioSteps> &
  TypedScenarioSteps

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { InferSchemaOutput, PikkuPermission, PikkuMiddleware, NodeConfig, PikkuApprovalDescription } from '${functionTypesImportPath}'
import type { ScopeId } from '${scopesImportPath}'
import { PikkuError } from '@pikku/core/errors'
import type { CorePermissionGroup } from '@pikku/core'

export type PikkuFunctionWorkflow<
  In = unknown,
  Out = never
> = PikkuFunctionSessionless<In, Out, 'workflow'>

export type PikkuFunctionScenario<
  In = unknown,
  Out = never
> = PikkuFunctionSessionless<In, Out, 'scenario' | 'actors'>

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
  /**
   * Scopes the session must hold to run this workflow. All of them are required
   * (AND), and they are checked before \`permissions\`.
   */
  scopes?: ScopeId[]
  permissions?: InputSchema extends StandardSchemaV1 ? CorePermissionGroup<PikkuPermission<InferSchemaOutput<InputSchema>>> : undefined
  middleware?: PikkuMiddleware[]
  input?: InputSchema
  output?: OutputSchema
  node?: NodeConfig
  errors?: Array<typeof PikkuError>
  inline?: boolean
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

export type PikkuScenarioConfigWithSchema<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = Omit<PikkuWorkflowConfigWithSchema<InputSchema, OutputSchema>, 'func' | 'auth' | 'scopes' | 'permissions'> & {
  func: PikkuFunctionScenario<
    InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown
  >
  /**
   * Runs before the scenario body. Same signature as \`func\`, but its return
   * value is discarded — a hook is setup, not a step, so it is never recorded
   * on the ladder. Throwing skips the body and fails the run; \`after\` still
   * runs.
   */
  before?: PikkuScenarioHook<InputSchema>
  /**
   * Always runs after the scenario body, in a \`finally\`, whether it passed or
   * failed. Throwing fails a run that would otherwise have passed; on an
   * already-failed run it attaches as the \`cause\` and never replaces the
   * original error.
   */
  after?: PikkuScenarioHook<InputSchema>
  /**
   * Why this scenario is held out of a default run, stated where the scenario
   * is. The scenario still appears in the plan and is reported as skipped
   * rather than quietly omitted; naming it directly with \`--flows\` runs it
   * anyway.
   */
  skip?: string
}

/**
 * A scenario lifecycle hook: the scenario's own \`(services, data, wire)\`
 * signature with its result discarded.
 */
export type PikkuScenarioHook<
  InputSchema extends StandardSchemaV1 | undefined = undefined
> = PikkuFunctionScenario<
  InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown,
  void
>

/**
 * Declares a scenario hook. Returns the function verbatim — a hook is never
 * registered, so this exists purely to give an inline hook a call site to be
 * contextually typed from, the way every other pikku primitive is.
 */
export function pikkuScenarioHook<In = unknown>(
  hook: PikkuFunctionScenario<In, void>
): PikkuFunctionScenario<In, void> {
  return hook
}

/**
 * A scenario: a complex workflow that drives the app the way users do.
 * Steps run as actors over the REAL transport — \`scenario.do(step, rpc,
 * data, { actor: actors.yasser })\` — so flows double as e2e tests and
 * staged/production health checks (no state reset; scope what you create).
 */
export function pikkuScenario<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuScenarioConfigWithSchema<InputSchema, OutputSchema>
): PikkuFunctionConfig<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'scenario' | 'actors', PikkuFunctionScenario<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown>, InputSchema, OutputSchema>
export function pikkuScenario<In, Out = unknown>(
  func:
    | PikkuFunctionScenario<In, Out>
    | PikkuFunctionConfig<In, Out, 'scenario' | 'actors', PikkuFunctionScenario<In, Out>>
): PikkuFunctionConfig<In, Out, 'scenario' | 'actors'>
export function pikkuScenario(func: any) {
  return typeof func === 'function' ? { func } : func
}

/**
 * A scenario as a feature references it. Any \`pikkuScenario\` export is
 * assignable; \`In\` is recovered from it so the paired form's \`data\` is
 * checked against that scenario's own input.
 */
export type PikkuScenarioRef<In = any, Out = any> = PikkuFunctionConfig<
  In,
  Out,
  'scenario' | 'actors',
  PikkuFunctionScenario<In, Out>,
  any,
  any
>

/**
 * One entry in a feature's \`scenarios\` list, validated against itself: a bare
 * scenario, or a scenario paired with the input to run it with. The paired form
 * is gherkin's \`Examples:\` written as an ordinary loop.
 */
export type PikkuFeatureEntry<Entry> = Entry extends {
  scenario: PikkuScenarioRef<infer In>
}
  ? { scenario: PikkuScenarioRef<In>; data: In }
  : Entry extends PikkuScenarioRef
    ? Entry
    : never

export type PikkuFeatureConfig<Scenarios extends readonly unknown[]> = {
  /** Human-readable name. The export identifier is the id. */
  name: string
  description?: string
  tags?: string[]
  scenarios: { [K in keyof Scenarios]: PikkuFeatureEntry<Scenarios[K]> }
  /**
   * Runs ONCE before the whole group — not before each scenario. Per-scenario
   * setup is the scenario's own \`before\`; gherkin's \`Background:\` is
   * deliberately not expressible here.
   */
  before?: PikkuScenarioHook
  after?: PikkuScenarioHook
}

/**
 * A feature: an ordered group of scenarios, mirroring gherkin's Feature ↔
 * Scenario structure. Scenarios are referenced by imported identifier, so a
 * renamed or deleted scenario is a compile error rather than a silent skip.
 *
 * A scenario does not have to belong to a feature — a void-input scenario
 * still runs standalone.
 *
 * \`\`\`ts
 * export const credentialFeature = pikkuFeature({
 *   name: 'Credential API',
 *   tags: ['credential'],
 *   before: startsMockOAuthServer,
 *   after: stopsMockOAuthServer,
 *   scenarios: [
 *     credentialLazyLoadScenario,
 *     ...['stripe', 'google'].map((name) => ({
 *       scenario: credentialRoundTripScenario,
 *       data: { name },
 *     })),
 *   ],
 * })
 * \`\`\`
 */
export function pikkuFeature<const Scenarios extends readonly unknown[]>(
  config: PikkuFeatureConfig<Scenarios>
): PikkuFeatureConfig<Scenarios> {
  return config
}

/**
 * One surface's implementation of a step.
 *
 * Each binding is typed independently, so a browser binding gets a non-optional
 * \`wire.browser\` and a cli binding a non-optional \`wire.cli\` without either
 * leaking into the other.
 */
export type PikkuFunctionScenarioStep<
  In = unknown,
  Out = never,
  Surface extends 'browser' | 'cli' | 'default' = 'default'
> = PikkuFunctionSessionless<
  In,
  Out,
  Surface extends 'default' ? 'scenarioStep' : 'scenarioStep' | Surface
>

export type PikkuScenarioStepConfigWithSchema<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = {
  /** Registered name — this is the string \`scenario.step()\` references. */
  name: string
  /**
   * What this step does, for the console and for whoever reads the source. It
   * is also the fallback prose when no \`template\` is declared, in which case a
   * reporter renders "Given the shopper buys an apple". Defaults to the call
   * site's step name.
   */
  description?: string
  /**
   * The prose a reporter renders for this step, with \`{placeholders}\` filled
   * from the input the step was called with — \`'sees {packageName}'\` reports as
   * "Then the admin sees @pikku/addon-todos". Every input field should appear,
   * so the report names the values under test rather than repeating one
   * sentence per call site.
   */
  template?: string
  title?: string
  tags?: string[]
  input?: InputSchema
  output?: OutputSchema
  errors?: Array<typeof PikkuError>
  /**
   * Drive this step through a real browser, as a human would. The runner
   * provisions a window for the step's actor first — which makes an actor
   * mandatory — and \`wire.browser\` is non-optional inside it.
   *
   * Compose shared utilities here rather than writing raw clicks: the step says
   * what the actor is doing, the utilities say how.
   */
  browser?: PikkuFunctionScenarioStep<
    InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown,
    'browser'
  >
  /** Drive this step remotely, over the websocket. */
  cli?: PikkuFunctionScenarioStep<
    InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown,
    'cli'
  >
  /**
   * The server-side path — the fast suite, and the floor every other surface
   * falls back to.
   *
   * On a \`then\`, this is not an alternative to the other bindings but a second
   * **witness**: the run executes every binding it has and fails if they
   * disagree, because "the row says paid" and "the page says paid" are different
   * claims and the gap between them is the bug nobody catches.
   */
  default?: PikkuFunctionScenarioStep<
    InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown,
    'default'
  >
}

export type PikkuScenarioStepConfig<In, Out> =
  Omit<PikkuScenarioStepConfigWithSchema<undefined, undefined>, 'browser' | 'cli' | 'default' | 'input' | 'output'> & {
    browser?: PikkuFunctionScenarioStep<In, Out, 'browser'>
    cli?: PikkuFunctionScenarioStep<In, Out, 'cli'>
    default?: PikkuFunctionScenarioStep<In, Out, 'default'>
  }

/**
 * A named, reusable scenario step, declaring one implementation per surface an
 * actor can drive it through.
 *
 * The step's identity is what the actor is trying to do; which surface carries
 * it out is a binding. That is what lets one ladder run through a real browser,
 * over the websocket, or entirely server-side — and what makes "how much of this
 * flow can a human actually reach" a number rather than a guess.
 *
 * Steps are deliberately NOT registered as RPCs: a browser-driving step must
 * never be network-callable.
 */
export function pikkuScenarioStep<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuScenarioStepConfigWithSchema<InputSchema, OutputSchema>
): PikkuFunctionConfig<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'scenarioStep' | 'browser' | 'cli', PikkuFunctionScenarioStep<InputSchema extends StandardSchemaV1 ? InferSchemaOutput<InputSchema> : unknown, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'browser' | 'cli' | 'default'>, InputSchema, OutputSchema>
export function pikkuScenarioStep<In, Out = unknown>(
  config: PikkuScenarioStepConfig<In, Out>
): PikkuFunctionConfig<In, Out, 'scenarioStep' | 'browser' | 'cli'>
export function pikkuScenarioStep(config: any) {
  const surfaces = (['browser', 'cli', 'default'] as const).filter(
    (surface) => typeof config[surface] === 'function'
  )
  if (surfaces.length === 0) {
    throw new Error(
      \`[scenario] step '\${config.name}' declares no surface bindings. Add at least a \\\`default\\\` (server-side) implementation.\`
    )
  }
  return {
    ...config,
    surfaces,
    // The runner sets the surface on the wire and calls this once per binding it
    // resolved — every witness of a \`then\`, exactly one for an action step.
    func: (services: any, data: any, wire: any) => {
      const surface = wire?.scenarioStep?.surface ?? 'default'
      const binding = config[surface] ?? config.default
      return binding(services, data, wire)
    },
  }
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

type GraphNodeConfigMap<FuncMap extends Record<string, string>> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    input?:
      | NodeInputType<FuncMap, K>
      | (() => NodeInputType<FuncMap, K>)
      | ((ref: RefFunction<FuncMap>, template: TemplateFunction) => NodeInputType<FuncMap, K>)
    onError?: Extract<keyof FuncMap, string> | Extract<keyof FuncMap, string>[]
    /** Free-text node documentation. Non-semantic — excluded from graphHash. */
    notes?: string
  }
}

type NextConfig<NodeIds extends string> = NodeIds | NodeIds[] | { if: string; then: NodeIds; else?: NodeIds }

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
