import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { clearSpool } from '../lib/finding-spool.js'

export const FabricFindingsClearInput = z.object({})

export const FabricFindingsClearOutput = z.object({
  dropped: z.number(),
})

export const FabricFindingsClear = pikkuSessionlessFunc({
  description: 'Discard every finding queued locally without sending it.',
  input: FabricFindingsClearInput,
  output: FabricFindingsClearOutput,
  func: async () => {
    const dropped = await clearSpool()
    console.log(`[fabric] dropped ${dropped} queued finding(s)`)
    return { dropped }
  },
})
