import { pikkuSessionlessFunc } from '#pikku'
import { runKnowledgeValidate } from '@pikku/knowledge'
import { renderKnowledgeValidate } from '../knowledge/render.js'
import {
  KnowledgeValidateInputSchema,
  KnowledgeValidateOutputSchema,
} from '../knowledge/schemas.js'

export const knowledgeValidate = pikkuSessionlessFunc({
  description:
    'Check the knowledge base against the app-project profile: every note typed, every section indexed, every slice gated, and every resource: pointing at something that still exists.',
  input: KnowledgeValidateInputSchema,
  output: KnowledgeValidateOutputSchema,
  func: async ({ config }) =>
    runKnowledgeValidate(config.rootDir, config.outDir),
})

export { renderKnowledgeValidate }
