import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const ListArrivalsInput = z.object({
  /** ISO date. Defaults to today, which is what a desk almost always wants. */
  on: z.string().optional(),
})

export const ListArrivalsOutput = z.object({
  arrivals: z.array(
    z.object({
      bookingId: z.string(),
      guestName: z.string(),
      roomType: z.string(),
      guests: z.number(),
      nights: z.number(),
      status: z.string(),
      roomNumber: z.string().nullable(),
    })
  ),
})

/**
 * Who is arriving, and whether they are still waiting to be checked in.
 *
 * `checkIn` takes a `bookingId`, and until this existed there was no way for a
 * person to obtain one: the front desk showed rooms, and rooms do not tell you
 * who is standing at the counter. The check-in function was reachable only by
 * an RPC scenario that knew a booking id in advance.
 *
 * Reads `bookings:read` rather than `bookings:checkin` — seeing the arrivals
 * board and being allowed to admit somebody are different permissions, and a
 * housekeeper wanting to know which rooms are needed today should not need the
 * second.
 */
export const listArrivals = pikkuFunc({
  expose: true,
  readonly: true,
  description: "Bookings arriving on a given day, with whether they are already in a room.",
  input: ListArrivalsInput,
  output: ListArrivalsOutput,
  scopes: ['bookings:read'],
  func: async ({ kysely }, { on }) => {
    const day = on ?? new Date().toISOString().slice(0, 10)

    const rows = await kysely
      .selectFrom('booking')
      .innerJoin('guest', 'guest.guestId', 'booking.guestId')
      .innerJoin('roomType', 'roomType.roomTypeId', 'booking.roomTypeId')
      .leftJoin('room', 'room.roomId', 'booking.roomId')
      .select([
        'booking.bookingId',
        'booking.guests',
        'booking.status',
        'booking.arrival',
        'booking.departure',
        'guest.fullName as guestName',
        'roomType.name as roomType',
        'room.number as roomNumber',
      ])
      // Cancelled and no-show bookings are not arrivals; a desk needs the list
      // of people it still has to deal with, not an audit of the day.
      .where('booking.arrival', '=', day)
      .where('booking.status', 'in', ['held', 'confirmed', 'checked_in'])
      .orderBy('guest.fullName')
      .execute()

    return {
      arrivals: rows.map((row) => ({
        bookingId: row.bookingId,
        guestName: row.guestName,
        roomType: row.roomType,
        guests: row.guests,
        nights: Math.max(
          1,
          Math.round(
            (new Date(row.departure).getTime() - new Date(row.arrival).getTime()) / 86_400_000
          )
        ),
        status: row.status,
        roomNumber: row.roomNumber ?? null,
      })),
    }
  },
})
