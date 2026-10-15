import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { changeRef, changesContext, nonBlank } from '../lib/changes.js'
import { dim, safe, safeBlock } from '@pikku/cli/addon-support'
import type { AskChangeQuestionOutput } from '../lib/types.js'

export const ChangesAskInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
  question: z.string(),
  option: z.array(z.string()).max(6).optional(),
  authorName: z.string().optional(),
})

export const ChangesAskOutput = z.object({
  message: z.any(),
})

export const ChangesAsk = pikkuSessionlessFunc({
  description: 'Ask the person who filed a change what you need to know.',
  input: ChangesAskInput,
  output: ChangesAskOutput,
  func: async (_services, input) => {
    const { rpc, projectId } = await changesContext(input.apiUrl)
    return await rpc.invoke('askChangeQuestion', {
      ...changeRef(projectId, input.changeId),
      question: nonBlank(
        input.question,
        'Ask something — the question is empty.'
      ),
      authorName: input.authorName ?? 'pikku-cli',
      ...(input.option?.length
        ? {
            option: input.option.map((option) =>
              nonBlank(option, 'An --option is empty.')
            ),
          }
        : {}),
    })
  },
})

export const renderChangesAsk = (
  _s: unknown,
  { message }: AskChangeQuestionOutput
): void => {
  const options = (message.attachments ?? []).filter(
    (attachment) => attachment.kind === 'option'
  )
  console.log('Asked — the item now shows as needing an answer in the panel.')
  console.log(dim(`  ${safeBlock(message.body)}`))
  if (options.length) {
    console.log(
      dim(
        `  they can click: ${options.map(({ label }) => safe(label)).join(' · ')}`
      )
    )
  }
}
