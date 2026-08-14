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
