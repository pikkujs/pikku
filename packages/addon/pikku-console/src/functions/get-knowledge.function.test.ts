import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'

import { getKnowledge } from './get-knowledge.function.js'
import type { KnowledgeBundle } from '../services/knowledge.service.js'

const BUNDLE = {
  notes: [],
  sections: [],
  tagCounts: {},
  stats: { notes: 0, sections: 0, links: 0, dangling: 0 },
  findings: [],
  ok: true,
} as KnowledgeBundle

test('getKnowledge hands back whatever the service read off disk', async () => {
  const result = await getKnowledge.func(
    { knowledgeService: { getBundle: async () => BUNDLE } } as never,
    null as never,
    {} as never
  )
  assert.deepEqual(result, BUNDLE)
})

test('getKnowledge refuses to answer where there is no project on disk', async () => {
  // The service is only registered when the console runs against a local
  // checkout. Deployed, there is no `knowledge/` to read, and the honest answer
  // is the error that says so rather than an empty base that looks like a
  // project nobody has written anything about.
  await assert.rejects(
    () => getKnowledge.func({} as never, null as never, {} as never),
    LocalEnvironmentOnlyError
  )
})
