import { pikkuVoidFunc } from '#pikku/function'

/**
 * One pass over the arrivals that need attention, firing the handler for each.
 *
 * This was a `setInterval` inside a trigger source. That reimplemented the
 * scheduler badly: it could not be invoked once, so nothing could test it, an
 * operator had no way to force it, and calling it would have leaked a timer.
 * The loop belonged to `wireScheduler` all along.
 */
export const sweepDueArrivals = pikkuVoidFunc({
  // Exposed so an operator can force a pass and a scenario can prove it works.
  expose: true,
  func: async ({ kysely, logger }, _data, { rpc }) => {
    const rows = await kysely
      .selectFrom('booking')
      .innerJoin('guest', 'guest.guestId', 'booking.guestId')
      .select(['booking.bookingId', 'booking.roomTypeId'])
      .where('booking.status', '=', 'confirmed')
      .where('booking.arrival', '=', new Date().toISOString().slice(0, 10))
      .execute()

    for (const row of rows) {
      await rpc.invoke('onArrivalDue', { bookingId: row.bookingId, roomTypeId: row.roomTypeId })
    }

    logger.info({ event: 'due_arrivals_swept', noticed: rows.length })
  },
})
