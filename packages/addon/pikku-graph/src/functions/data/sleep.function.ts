import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const SleepInput = z.object({
  name: z.string().describe('A unique name for this sleep step'),
  ms: z.number().describe('Duration to sleep in milliseconds'),
})

export const sleep = pikkuSessionlessFunc({
  description: 'Sleep for a specified duration before continuing',
  node: { displayName: 'Sleep', category: 'Data', type: 'action' },
  input: SleepInput,
  output: z.void(),
  func: async (_services, data, { workflow }) => {
    if (!workflow) throw new Error('sleep can only be called from within a workflow')
    await workflow.sleep(data.name, `${data.ms}ms`)
  },
})
