export {
  KNOWLEDGE_DIR,
  type KnowledgeNote,
  type ProfileNote,
  readKnowledgeNotes,
  resourceIds,
} from './notes.js'

export {
  type Decision,
  type DecisionFence,
  decisionFences,
  parseDecisionFence,
} from './decision-fence.js'

export {
  type ResourcePrefix,
  type ResourceUri,
} from './resource-uri.js'

export {
  type ResourceCheck,
  type ResourceProblem,
  type ResourceCheckOptions,
  bodyResourceUris,
  checkKnowledgeResources,
} from './check-resources.js'

export {
  SLICE_STATUSES,
  type SliceStatus,
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
