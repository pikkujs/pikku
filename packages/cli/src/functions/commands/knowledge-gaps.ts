import { pikkuSessionlessFunc } from '#pikku/function'
import { renderKnowledgeGaps } from '../knowledge/render.js'
import {
  KnowledgeGapsInputSchema,
  KnowledgeGapsOutputSchema,
} from '../knowledge/schemas.js'

export const knowledgeGaps = pikkuSessionlessFunc({
  description:
    'List the knowledge notes no change builds yet — new, edited since they were built, or merged with items deferred — leaving out any already filed as a change.',
  input: KnowledgeGapsInputSchema,
  output: KnowledgeGapsOutputSchema,
  func: async (_services, input, { rpc }) =>
    (rpc.invoke as any)('changes:ChangesKnowledgeGaps', input),
})

export { renderKnowledgeGaps }
