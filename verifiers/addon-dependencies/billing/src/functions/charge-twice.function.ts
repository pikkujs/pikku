import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../.pikku/addon/function/index.js'

export const ChargeTwiceInput = z.object({ amountCents: z.number().int() })
export const ChargeTwiceOutput = z.object({ totalCents: z.number() })

/** Calls `stripe:charge` — the alias billing declares — with no cast. */
export const chargeTwice = pikkuSessionlessFunc({
  description: 'Charges an amount twice through the stripe addon',
  input: ChargeTwiceInput,
  output: ChargeTwiceOutput,
  func: async (_services, { amountCents }, { rpc }) => {
    const first = await rpc.invoke('stripe:charge', { amountCents })
    const second = await rpc.invoke('stripe:charge', { amountCents })
    return { totalCents: first.chargedCents + second.chargedCents }
  },
})
