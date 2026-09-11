import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changesContext } from '../lib/changes.js'
import { dim } from '../lib/output.js'
import type { AskChangeQuestionOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesAskInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
  question: z.string(),
  authorName: z.string().optional(),
})

export const FabricChangesAskOutput = z.object({
  message: z.any(),
})

export const FabricChangesAsk = pikkuSessionlessFunc({
  description: 'Ask the person who filed a change what you need to know.',
  input: FabricChangesAskInput,
  output: FabricChangesAskOutput,
  func: async (_services, input) => {
    const { rpc } = await changesContext(input.apiUrl)
    return await rpc.invoke('askChangeQuestion', {
      changeId: input.changeId,
      question: input.question,
      authorName: input.authorName ?? 'pikku-cli',
    })
  },
})

export const renderChangesAsk = (
  _s: unknown,
  { message }: AskChangeQuestionOutput
): void => {
  console.log('Asked — the item now shows as needing an answer in the panel.')
  console.log(dim(`  ${message.body}`))
}
