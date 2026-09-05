import { pikkuSessionlessFunc } from '#pikku/function'
import { runKnowledgeReconcile } from '@pikku/knowledge'
import { renderKnowledgeReconcile } from '../knowledge/render.js'
import {
  KnowledgeReconcileInputSchema,
  KnowledgeReconcileOutputSchema,
} from '../knowledge/schemas.js'

export const knowledgeReconcile = pikkuSessionlessFunc({
  description:
    'Say the one thing to do next with the knowledge base — repair a note, write a plan, ask the user, dispatch a build, or nothing — derived from what is on disk rather than from what a previous step remembered to announce.',
  input: KnowledgeReconcileInputSchema,
  output: KnowledgeReconcileOutputSchema,
  func: async ({ config }) => runKnowledgeReconcile(config.rootDir),
})

export { renderKnowledgeReconcile }
