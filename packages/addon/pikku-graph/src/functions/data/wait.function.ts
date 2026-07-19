import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const WaitInput = z.object({
  name: z.string().describe('A unique name for this wait step'),
  amount: z.number().default(1).describe('How long to wait'),
  unit: z
    .enum(['seconds', 'minutes', 'hours', 'days'])
    .default('seconds')
    .describe('The unit for the wait amount'),
})

export const WaitOutput = z.void()

const UNIT_MS: Record<z.infer<typeof WaitInput>['unit'], number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
}

export const wait = pikkuSessionlessFunc({
  description: 'Pause the workflow for a fixed interval before continuing',
  node: { displayName: 'Wait', category: 'Data', type: 'action' },
  input: WaitInput,
  output: WaitOutput,
  func: async (_services, data, { workflow }) => {
    if (!workflow)
      throw new Error('wait can only be called from within a workflow')
    await workflow.sleep(data.name, `${data.amount * UNIT_MS[data.unit]}ms`)
  },
})
