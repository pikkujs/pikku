import { pikkuSessionlessFunc } from '#pikku/function'
import { changesContext } from '../../fabric/lib/changes.js'
import { openKnowledgeGaps } from '../../fabric/lib/knowledge-gaps.js'
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
  func: async ({ config }) => {
    const { rpc, projectId } = await changesContext(undefined)
    return openKnowledgeGaps(config.rootDir, rpc, projectId!)
  },
})

export { renderKnowledgeGaps }
