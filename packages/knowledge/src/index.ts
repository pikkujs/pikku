export {
  KNOWLEDGE_DIR,
  KnowledgeNoteSchema,
  type KnowledgeNote,
  parseNote,
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
  RESOURCE_PREFIXES,
  type ResourcePrefix,
  type ResourceUri,
  collectKnownResources,
  parseResourceUri,
} from './resource-uri.js'

export {
  ResourceCheckSchema,
  ResourceProblemSchema,
  type ResourceCheck,
  type ResourceProblem,
  checkKnowledgeResources,
} from './check-resources.js'

export {
  KNOWLEDGE_SECTIONS,
  KnowledgeFindingSchema,
  KnowledgeValidateInput,
  KnowledgeValidateOutput,
  type KnowledgeFinding,
  type KnowledgeValidateResult,
  runKnowledgeValidate,
} from './validate.js'

export {
  KnowledgeGraphNoteSchema,
  KnowledgeGraphSchema,
  KnowledgeSectionSchema,
  type KnowledgeGraph,
  type KnowledgeGraphNote,
  buildKnowledgeGraph,
  outboundLinks,
} from './graph.js'

export {
  KnowledgeIndexInput,
  KnowledgeIndexOutput,
  ReindexedFileSchema,
  type KnowledgeIndexResult,
  type ReindexedFile,
  runKnowledgeIndex,
} from './reindex.js'
