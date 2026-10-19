import { defineScope } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * What may be done in the hotel.
 *
 * Every node is grantable, so nesting decides the boundary: `bookings` grants
 * everything beneath it, `bookings:read` grants only reading. That is why
 * cancelling is a sibling of reading rather than a top-level scope — a role
 * that should handle the whole booking lifecycle says `bookings`.
 *
 * There is deliberately no `admin` here: `@pikku/addon-console` declares that
 * tree, and scopes sharing a name must declare the same one. The hotel
 * composes with it rather than competing.
 */
// @snippet start defineScopes
defineScope({
  rooms: {
    displayName: 'Rooms',
    description: 'The rooms themselves, and what state they are in',
    scopes: {
      read: { description: 'See rooms and their status' },
      write: { description: 'Add rooms, change rates, take one out of service' },
    },
  },
  bookings: {
    displayName: 'Bookings',
    description: 'Reservations, arrivals and departures',
    scopes: {
      read: { description: 'See bookings' },
      create: { description: 'Make a booking' },
      modify: { description: 'Change dates, room type or guest count' },
      cancel: { description: 'Cancel a booking' },
      checkin: { description: 'Check a guest in and assign a room' },
      checkout: { description: 'Check a guest out and close the stay' },
    },
  },
  housekeeping: {
    displayName: 'Housekeeping',
    description: 'Cleaning and maintenance of rooms',
    scopes: {
      read: { description: 'See the housekeeping board' },
      assign: { description: 'Assign work to somebody' },
      complete: { description: 'Mark a task done' },
    },
  },
  reports: {
    displayName: 'Reports',
    description: 'Occupancy and revenue',
    scopes: {
      read: { description: 'Read occupancy and revenue reports' },
    },
  },
})
// @snippet end defineScopes
