import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'

export const CreateBookingInput = z.object({
  roomTypeId: z.string(),
  arrival: z.string(),
  departure: z.string(),
  guests: z.number().int().positive().default(1),
})

export const CreateBookingOutput = z.object({
  bookingId: z.string(),
  status: z.string(),
  totalCents: z.number(),
  nights: z.number(),
})

// @snippet start writeFunction
export const createBooking = pikkuFunc({
  expose: true,
  description: 'Hold a room of the requested type for the requested nights.',
  input: CreateBookingInput,
  output: CreateBookingOutput,
  scopes: ['bookings:create'],
  // Writes are audited: `audit: true` wraps kysely so every table write this
  // function makes is captured, rather than relying on somebody remembering to
  // log it.
  audit: true,
  func: async ({ kysely }, { roomTypeId, arrival, departure, guests }, { session }) => {
    const nights = Math.max(
      1,
      Math.round(
        (new Date(departure).getTime() - new Date(arrival).getTime()) / 86_400_000
      )
    )

    const roomType = await kysely
      .selectFrom('roomType')
      .select(['roomTypeId', 'baseRateCents', 'capacity'])
      .where('roomTypeId', '=', roomTypeId)
      .executeTakeFirstOrThrow()

    if (guests > roomType.capacity) {
      throw new Error(`That room sleeps ${roomType.capacity}, not ${guests}`)
    }

    // A booking is held, not confirmed. Confirmation is the workflow's job —
    // it happens after payment, and the hold is what stops two people taking
    // the last suite while one of them is still typing a card number.
    const guest = await kysely
      .selectFrom('guest')
      .select('guestId')
      .where('userId', '=', session.userId)
      .executeTakeFirst()

    const guestId = guest?.guestId ?? randomUUID()
    if (!guest) {
      await kysely
        .insertInto('guest')
        .values({ guestId, userId: session.userId, fullName: 'Guest' })
        .execute()
    }

    const bookingId = randomUUID()
    const totalCents = roomType.baseRateCents * nights

    await kysely
      .insertInto('booking')
      .values({
        bookingId,
        guestId,
        roomTypeId,
        arrival,
        departure,
        guests,
        status: 'held',
        totalCents,
        source: 'direct',
      })
      .execute()

    return { bookingId, status: 'held', totalCents, nights }
  },
})
// @snippet end writeFunction
