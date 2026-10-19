import { pikkuSessionlessFunc } from '../../.pikku/addon/function/index.js'
import { ChargeInput, ChargeOutput } from './charge.schemas.js'

export const charge = pikkuSessionlessFunc({
  description: 'Charges an amount',
  input: ChargeInput,
  output: ChargeOutput,
  func: async (_services, { amountCents }) => ({
    chargeId: `ch_${amountCents}`,
    chargedCents: amountCents,
  }),
  remote: true,
})
