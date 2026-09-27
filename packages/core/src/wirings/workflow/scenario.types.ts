import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionHook,
} from '../../function/functions.types.js'

export type {
  ScenarioStepInvocation,
  ScenarioStepMeta,
  PikkuScenarioWire,
} from './dsl/workflow-dsl.types.js'

export type {
  ScenarioStepPhase,
  ScenarioStepKind,
  ScenarioStepOptions,
  PikkuScenarioStepWire,
  ScenarioEnvironment,
  ScenarioSurface,
  ScenarioSurfaceResolution,
  PikkuBrowserWire,
  ScenarioScreenshotOptions,
  TestIdSelector,
  ScenarioBrowserProvider,
  ScenarioBrowserFailure,
} from './scenario-step.types.js'

export type CoreFeatureScenario =
  | CorePikkuFunctionConfig<any, any, any>
  | { scenario: CorePikkuFunctionConfig<any, any, any>; data: unknown }

export type CoreFeature = {
  name: string
  description?: string
  tags?: string[]
  /**
   * Whether this feature is guide material. Defaults to true: a feature is a
   * page of the user guide unless it says otherwise, so a feature nobody has
   * written about is a gap `pikku scenario guide` reports rather than a page
   * silently missing. Pure plumbing — a wire, a validation layer, a bearer
   * auth handshake — sets it false and stops being a coverage problem.
   */
  document?: boolean
  scenarios: readonly CoreFeatureScenario[]
  before?: CorePikkuFunctionHook
  after?: CorePikkuFunctionHook
}

export type FeatureMetaEntry = {
  scenario: string
  data?: unknown
}

export type FeatureMeta = {
  id: string
  name: string
  description?: string
  tags: string[]
  /** Present only when the feature opted out; absent means documented. */
  document?: boolean
  entries: FeatureMetaEntry[]
  unresolvedEntries: number
  hasBefore: boolean
  hasAfter: boolean
}

export type FeaturesMeta = Record<string, FeatureMeta>

export type FeaturePlanEntry = {
  featureId: string
  featureName: string
  scenarioName: string
  data?: unknown
  tags: string[]
}
