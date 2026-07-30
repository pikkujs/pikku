import { pikkuSessionlessFunc } from '#pikku'
import { runKnowledgeIndex } from '@pikku/knowledge'
import { renderKnowledgeIndex } from '../knowledge/render.js'
import {
  KnowledgeIndexInputSchema,
  KnowledgeIndexOutputSchema,
} from '../knowledge/schemas.js'

export const knowledgeIndex = pikkuSessionlessFunc({
  description:
    "Refresh every index.md so each section lists the notes actually in it, replacing only the generated block and leaving each index's prose alone.",
  input: KnowledgeIndexInputSchema,
  output: KnowledgeIndexOutputSchema,
  func: async ({ config }, { check }) =>
    runKnowledgeIndex(config.rootDir, check ?? false),
})

export { renderKnowledgeIndex }
