import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { KnowledgeBundle } from '../services/knowledge.service.js'

export const getKnowledge = pikkuFunc<null, KnowledgeBundle | null>({
  title: 'Get Knowledge Base',
  description:
    "Reads the project's knowledge/ notes and returns them as a graph — each note with its links in both directions, plus the sections, tag counts, and what `pikku knowledge validate` reports.",
  expose: true,
  scopes: ['pikku:console:knowledge:read'],
  func: async ({ knowledgeService }) => {
    if (!knowledgeService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    return knowledgeService.getBundle()
  },
})
