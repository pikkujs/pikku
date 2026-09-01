export {
  KNOWLEDGE_DIR,
  type KnowledgeNote,
  type ProfileNote,
  MILESTONE_TYPE,
  listOf,
  noteHash,
  readKnowledgeNotes,
  resourceIds,
} from './notes.js'

export {
  type Decision,
  type DecisionFence,
  decisionFences,
  parseDecisionFence,
} from './decision-fence.js'

export { type ResourcePrefix, type ResourceUri } from './resource-uri.js'

export {
  type ResourceCheck,
  type ResourceProblem,
  type ResourceCheckOptions,
  bodyResourceUris,
  checkKnowledgeResources,
} from './check-resources.js'

export {
  MILESTONE_SECTION,
  MILESTONE_STATUSES,
  type MilestoneStatus,
  KnowledgeValidateInput,
  KnowledgeValidateOutput,
  type KnowledgeFinding,
  type KnowledgeValidateResult,
  runKnowledgeValidate,
} from './validate.js'

export {
  KnowledgeGraphNoteSchema,
  KnowledgeGraphSchema,
  type KnowledgeGraph,
  buildKnowledgeGraph,
} from './graph.js'

export {
  KnowledgeIndexInput,
  KnowledgeIndexOutput,
  type KnowledgeIndexResult,
  runKnowledgeIndex,
} from './reindex.js'

export {
  PLAN_VERSION,
  FIRST_PASS,
  MAX_DEFERRALS,
  CLASSIFICATIONS,
  WireTransport,
  PlanSchema,
  type Plan,
  type PlanSlot,
  type PlanRead,
  type PlanDefer,
  type Deferral,
  type CoverageState,
  type NoteCoverage,
  planSchemaJson,
  itemsOf,
  scenarioPass,
  plannedApps,
  planPathFor,
  planIdFor,
  milestonePathForPlanId,
  readPlan,
  writePlan,
  renderPlanForBuild,
  deferPlanItem,
  deferOutstandingItems,
  checkFirstPass,
  checkAgainstMilestone,
  checkPlanInternals,
  knowledgeCoverage,
} from './plan.js'

export {
  type PikkuMeta,
  type PlannedTransport,
  type PlanChecklistItem,
  type PlanProgress,
  type PlanShortfallResult,
  functionsDirFor,
  readPikkuMeta,
  planProgress,
  shallowScenarioProblems,
  cascadeProblems,
  planShortfall,
} from './plan-meta.js'

export {
  MILESTONES_DIR,
  MILESTONE_SURFACES,
  type MilestoneSurface,
  inMilestonesDir,
  surfaceOf,
  readMilestones,
  gherkinOf,
  personasIn,
} from './milestone.js'

export {
  type ScenarioDepth,
  classifyScenario,
  scenarioDepths,
} from './hollow-scenarios.js'

export {
  KnowledgePlanSchemaInput,
  KnowledgePlanSchemaOutput,
  type KnowledgePlanSchemaResult,
  runKnowledgePlanSchema,
  KnowledgePlanShowInput,
  KnowledgePlanShowOutput,
  type KnowledgePlanShowResult,
  runKnowledgePlanShow,
  KnowledgePlanSetInput,
  KnowledgePlanSetOutput,
  type KnowledgePlanSetResult,
  runKnowledgePlanSet,
  KnowledgePlanDeferInput,
  KnowledgePlanDeferOutput,
  type KnowledgePlanDeferResult,
  runKnowledgePlanDefer,
} from './plan-command.js'

export { type MilestoneNote, MILESTONE_SCALARS } from './milestone.js'
