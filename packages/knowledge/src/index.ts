export {
  KNOWLEDGE_DIR,
  type KnowledgeNote,
  type ProfileNote,
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
  type ResourceOrphan,
  type ResourceCheckOptions,
  ORPHAN_PREFIXES,
  bodyResourceUris,
  checkKnowledgeResources,
} from './check-resources.js'

export {
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
  PLAN_SURFACES,
  PLANS_DIR,
  type PlanSurface,
  planPathFor,
  parsePlan,
  readPlan,
  readPlans,
  writePlan,
  renderPlanForBuild,
  deferPlanItem,
  deferOutstandingItems,
  checkFirstPass,
  checkCovers,
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
  KnowledgePlanProgressInput,
  KnowledgePlanProgressOutput,
  type KnowledgePlanProgressResult,
  runKnowledgePlanProgress,
  KnowledgePlanSetInput,
  KnowledgePlanSetOutput,
  type KnowledgePlanSetResult,
  runKnowledgePlanSet,
  KnowledgePlanDeferInput,
  KnowledgePlanDeferOutput,
  type KnowledgePlanDeferResult,
  runKnowledgePlanDefer,
} from './plan-command.js'

export {
  KNOWLEDGE_LINE,
  KnowledgeGapSchema,
  type KnowledgeGap,
  type KnowledgeGapOptions,
  KnowledgeGapsInput,
  KnowledgeGapsOutput,
  type KnowledgeGapsResult,
  filedKnowledge,
  knowledgeLine,
  runKnowledgeGaps,
} from './reconcile.js'

export { basePlan } from './plan-fixture.js'
