import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const ListRoomsInput = z.object({
  floor: z.number().int().optional(),
  housekeepingStatus: z
    .enum(['clean', 'dirty', 'inspected', 'out_of_service'])
    .optional(),
})

export const ListRoomsOutput = z.object({
  rooms: z.array(
    z.object({
      roomId: z.string(),
      number: z.string(),
      floor: z.number(),
      roomType: z.string(),
      capacity: z.number(),
      housekeepingStatus: z.string(),
    })
  ),
})

// @snippet start readFunction
export const listRooms = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'List rooms, optionally filtered by floor or housekeeping status.',
  input: ListRoomsInput,
  output: ListRoomsOutput,
  // Everyone who works here can see the rooms — a housekeeper needs the board
  // as much as the front desk does. What differs is what they may *do*, which
  // is a different scope on a different function.
  scopes: ['rooms:read'],
  func: async ({ kysely }, { floor, housekeepingStatus }) => {
    let query = kysely
      .selectFrom('room')
      .innerJoin('roomType', 'roomType.roomTypeId', 'room.roomTypeId')
      .select([
        'room.roomId',
        'room.number',
        'room.floor',
        'room.housekeepingStatus',
        'roomType.name as roomType',
        'roomType.capacity',
      ])
      .orderBy('room.number')

    if (floor !== undefined) query = query.where('room.floor', '=', floor)
    if (housekeepingStatus) {
      query = query.where('room.housekeepingStatus', '=', housekeepingStatus)
    }

    return { rooms: await query.execute() }
  },
})
// @snippet end readFunction
