import { wireHTTP } from '#pikku/http'
import { scheduleTurnover } from '../../functions/schedule-turnover.function.js'
import { startReservation } from '../hotel.workflow.js'
import { listRooms } from '../../functions/list-rooms.function.js'
import { createBooking } from '../../functions/create-booking.function.js'
import { checkIn } from '../../functions/check-in.function.js'
import { listArrivals } from '../../functions/list-arrivals.function.js'
import { completeHousekeepingTask } from '../../functions/complete-housekeeping-task.function.js'
import { listHousekeepingTasks } from '../../functions/list-housekeeping-tasks.function.js'

/**
 * The hotel's HTTP surface.
 *
 * Every route here is `auth: true`: there is no anonymous read in a property
 * management system — even the room list tells you what the hotel has and how
 * full it is. Authorization is on the functions (see their `scopes`), so the
 * wiring only maps a route to one.
 */
// @snippet start wireHttp
wireHTTP({
  method: 'get',
  route: '/rooms',
  func: listRooms,
  auth: true,
})

wireHTTP({
  method: 'get',
  route: '/arrivals',
  func: listArrivals,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/bookings',
  func: createBooking,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/bookings/:bookingId/check-in',
  func: checkIn,
  auth: true,
})

wireHTTP({
  method: 'get',
  route: '/housekeeping',
  func: listHousekeepingTasks,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/housekeeping/:taskId/complete',
  func: completeHousekeepingTask,
  auth: true,
})
// @snippet end wireHttp

wireHTTP({
  method: 'post',
  route: '/bookings/:bookingId/reserve',
  func: startReservation,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/rooms/:roomId/turnover',
  func: scheduleTurnover,
  auth: true,
})
