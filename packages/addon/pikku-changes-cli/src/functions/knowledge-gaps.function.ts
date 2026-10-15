import { KnowledgeGapsInput, KnowledgeGapsOutput } from '@pikku/knowledge'
import { git } from '@pikku/cli/addon-support'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { changesContext } from '../lib/context.js'
import { openKnowledgeGaps } from '../lib/knowledge-gaps.js'

export const ChangesKnowledgeGaps = pikkuSessionlessFunc({
  description:
    'List the knowledge notes no change builds yet — new, edited since they were built, or merged with items deferred — leaving out any already filed as a change.',
  input: KnowledgeGapsInput,
  output: KnowledgeGapsOutput,
  func: async ({ config }) => {
    const root =
      config.rootDir ?? (await git(['rev-parse', '--show-toplevel'])).trim()
    const { rpc, projectId } = await changesContext(undefined)
    return openKnowledgeGaps(root, rpc, projectId!)
  },
})
