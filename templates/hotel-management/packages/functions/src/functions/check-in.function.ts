import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { pikkuPermission } from '#pikku/auth'

export const CheckInInput = z.object({
  bookingId: z.string(),
  roomId: z.string().optional(),
})

export const CheckInOutput = z.object({
  bookingId: z.string(),
  roomId: z.string(),
  roomNumber: z.string(),
})

/**
 * A guest may only ever act on their own booking. This cannot be a scope —
 * "yours" depends on the row, not on the role — which is exactly the split
 * scopes and permissions exist to draw.
 */
export const isOwnBooking = pikkuPermission(
  async ({ kysely }, { bookingId }: { bookingId: string }, { session }) => {
    const row = await kysely
      .selectFrom('booking')
      .innerJoin('guest', 'guest.guestId', 'booking.guestId')
      .select('guest.userId')
      .where('booking.bookingId', '=', bookingId)
      .executeTakeFirst()
    // A permission runs for anonymous callers too, so `session` is optional
    // here. Comparing against `undefined` fails closed, which is the behaviour
    // you want when the question is "is this yours".
    return !!session && row?.userId === session.userId
  }
)

// @snippet start scopedFunction
export const checkIn = pikkuFunc({
  expose: true,
  description: 'Check a guest in, assigning a clean room of the booked type.',
  input: CheckInInput,
  output: CheckInOutput,
  // The front desk holds `bookings:checkin` and checks in anybody. A guest
  // holds no such scope, so self check-in is not reachable by accident — if it
  // is ever wanted, it is a scope grant rather than a code change.
  scopes: ['bookings:checkin'],
  audit: true,
  func: async ({ kysely, queueService}, { bookingId, roomId }) => {
    const booking = await kysely
      .selectFrom('booking')
      .select(['bookingId', 'roomTypeId', 'status'])
      .where('bookingId', '=', bookingId)
      .executeTakeFirstOrThrow()

    if (booking.status !== 'confirmed') {
      throw new Error(`Cannot check in a booking that is ${booking.status}`)
    }

    // Rooms are assigned at check-in rather than at booking, so housekeeping
    // and maintenance can move people around right up to arrival.
    const room = roomId
      ? await kysely
          .selectFrom('room')
          .select(['roomId', 'number'])
          .where('roomId', '=', roomId)
          .executeTakeFirstOrThrow()
      : await kysely
          .selectFrom('room')
          .select(['roomId', 'number'])
          .where('roomTypeId', '=', booking.roomTypeId)
          .where('housekeepingStatus', 'in', ['clean', 'inspected'])
          .where(({ not, exists, selectFrom }) =>
            not(
              exists(
                selectFrom('booking as b')
                  .select('b.bookingId')
                  .whereRef('b.roomId', '=', 'room.roomId')
                  .where('b.status', '=', 'checked_in')
              )
            )
          )
          .executeTakeFirst()

    if (!room) throw new Error('No clean room of that type is free')

    await kysely
      .updateTable('booking')
      .set({ status: 'checked_in', roomId: room.roomId })
      .where('bookingId', '=', bookingId)
      .execute()

    // The audit worker was wired to a queue nothing pushed to. This is the kind

    // of change it exists for: deliberate, human, and leaving no row of its own

    // that explains who did it.

    await queueService

      ?.add('audit-event', { entityType: 'booking', entityId: bookingId, action: 'checked_in' })

      .catch(() => undefined)


    return { bookingId, roomId: room.roomId, roomNumber: room.number }
  },
})
// @snippet end scopedFunction
