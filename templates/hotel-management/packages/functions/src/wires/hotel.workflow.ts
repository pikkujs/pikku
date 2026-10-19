import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'

// @snippet start wireWorkflow
// Every step of a workflow is an ordinary pikku function. That is what makes a
// step retryable on its own, replayable from the durable log, and visible as a
// node in the generated graph.
export const confirmBooking = pikkuSessionlessFunc({
  description: 'Move a held booking to confirmed once payment has cleared.',
  func: async ({ kysely }, { bookingId }: { bookingId: string }) => {
    await kysely
      .updateTable('booking')
      .set({ status: 'confirmed' })
      .where('bookingId', '=', bookingId)
      .execute()
    return { bookingId }
  },
})

export const chargeDeposit = pikkuSessionlessFunc({
  description: 'Take the first night as a deposit.',
  func: async ({ kysely }, { bookingId }: { bookingId: string }) => {
    const booking = await kysely
      .selectFrom('booking')
      .select(['totalCents'])
      .where('bookingId', '=', bookingId)
      .executeTakeFirstOrThrow()
    return { chargedCents: Math.round(booking.totalCents / 2) }
  },
})

export const notifyGuest = pikkuSessionlessFunc({
  description: 'Tell the guest their booking is confirmed.',
  func: async ({ logger }, { bookingId }: { bookingId: string }) => {
    logger.info({ event: 'booking_confirmed_email', bookingId })
  },
})

// The body is the plan, not the work: each `workflow.do` names a step and the
// engine decides when to run it. That is why this survives a restart — the
// completed steps are replayed from the log rather than re-executed, so a crash
// after the deposit is taken does not take it twice.
export const reserveStay = pikkuWorkflowFunc<
  { bookingId: string },
  { bookingId: string; chargedCents: number }
>({
  expose: true,
  // The parameter must be named rather than destructured — the inspector reads
  // the step graph statically and needs something to trace `data.x` back to.
  func: async (_services, data, { workflow }) => {
    const payment = await workflow.do('Charge deposit', 'chargeDeposit', {
      bookingId: data.bookingId,
    })
    await workflow.do('Confirm booking', 'confirmBooking', {
      bookingId: data.bookingId,
    })
    await workflow.do('Notify guest', 'notifyGuest', {
      bookingId: data.bookingId,
    })
    return { bookingId: data.bookingId, chargedCents: payment.chargedCents }
  },
})
// @snippet end wireWorkflow

export const startReservationInput = z.object({
  bookingId: z.string(),
})
export const startReservationOutput = z.object({ runId: z.string() })

/**
 * The workflow's front door.
 *
 * A workflow cannot be called over plain RPC — invoked that way it gets no
 * workflow context and dies on `workflow.do` being undefined. It has to be
 * *started*, which needs an ordinary function to start it. Without one
 * `reserveStay` had no caller at all: its steps were real logic nothing could
 * begin, and the same shape as the shop's `startCheckout`.
 */
export const startReservation = pikkuFunc({
  expose: true,
  description: 'Reserve a stay: charge the deposit, confirm the booking, notify the guest.',
  input: startReservationInput,
  output: startReservationOutput,
  func: async (_services, data, { rpc }) => {
    const runId = await rpc.startWorkflow('reserveStay', data)
    return { runId: String(runId) }
  },
})
