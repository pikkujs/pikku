import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const SeatsExceededPayload = z.object({
  orgId: z.string(),
  seats: z.number(),
  members: z.number(),
})

export const onSeatsExceeded = pikkuSessionlessFunc({
  // Exposed so the operations screen can raise one on demand. Otherwise this
  // runs only when something else queues it, and nobody can force it when it
  // matters or prove it still works.
  expose: true,
  description: 'Fires when an organisation has more members than seats.',
  input: SeatsExceededPayload,
  func: async ({ logger }, { orgId, seats, members }) => {
    // Deliberately does not block anybody. Cutting off access the moment a
    // count crosses a line punishes the wrong person — the member who joined
    // last, not the account that under-bought.
    logger.warn({ event: 'seats_exceeded', orgId, seats, members })
  },
})
