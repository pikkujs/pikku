export type {
  PikkuScenarioWire,
  ScenarioStepMeta,
} from '../wirings/workflow/dsl/workflow-dsl.types.js'
export { FileScenarioRunStore } from '../services/file-scenario-run-store.js'
export type { FileScenarioRunStoreOptions } from '../services/file-scenario-run-store.js'
export {
  addFeature,
  resolveFeatureScenarios,
} from '../wirings/workflow/feature.js'
export { PikkuScenarioService } from '../wirings/workflow/pikku-scenario-service.js'
export { composeStepProse } from '../wirings/workflow/scenario-prose.js'
export { SCENARIO_SURFACES } from '../wirings/workflow/scenario-step.types.js'
export type {
  PikkuBrowserWire,
  ScenarioBrowserFailure,
  ScenarioBrowserProvider,
  ScenarioStepKind,
  ScenarioStepOptions,
  ScenarioStepPhase,
} from '../wirings/workflow/scenario-step.types.js'
export type {
  CoreFeature,
  FeaturesMeta,
} from '../wirings/workflow/scenario.types.js'
export type {
  ScenarioArtifact,
  ScenarioArtifactKind,
  ScenarioFailureDetail,
  ScenarioResult,
  ScenarioRunRecord,
  ScenarioRunReport,
  ScenarioRunStatus,
  ScenarioRunStore,
  ScenarioRunSummary,
  ScenarioSkip,
  ScenarioStepRow,
} from '../wirings/workflow/scenario-run.types.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { ScenarioSurface } from '../wirings/workflow/scenario-step.types.js'
export type { FeaturePlanEntry } from '../wirings/workflow/scenario.types.js'
export type { CoreWorkflow } from '../wirings/workflow/workflow.types.js'
