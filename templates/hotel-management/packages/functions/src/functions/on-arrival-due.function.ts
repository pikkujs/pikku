import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const ArrivalDuePayload = z.object({
  bookingId: z.string(),
  roomTypeId: z.string(),
})

// @snippet start wireTrigger
// A trigger handler is an ordinary function. What makes it a trigger is that
// nothing calls it directly — a source decides when it fires.
export const onArrivalDue = pikkuSessionlessFunc({
  expose: false,
  description: 'Fires when a confirmed booking is due to arrive today.',
  input: ArrivalDuePayload,
  func: async ({ logger }, { bookingId, roomTypeId }) => {
    logger.info({ event: 'arrival_due', bookingId, roomTypeId })
  },
})

