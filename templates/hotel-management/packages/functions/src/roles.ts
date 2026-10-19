import { defineSystemRole } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * Who may do it.
 *
 * These roles ship with the hotel: the console may grant them but cannot
 * rename, re-scope or delete them. Roles a manager composes in the console are
 * a different thing and are not declared here — which is why a persona may
 * only name one of these. A composed role can be deleted, and a persona pinned
 * to one would go on claiming to test something nobody grants.
 *
 * Removing a role here does not revoke it. The row stays, marked undeclared and
 * inert, until `pikku roles prune` — a deploy should not be able to strip a
 * receptionist's access the moment it rolls out mid-shift.
 */
// @snippet start defineRoles
defineSystemRole({
  guest: {
    displayName: 'Guest',
    description: 'Books rooms and sees their own reservations',
    scopes: ['rooms:read', 'bookings:create', 'bookings:read'],
  },
  /**
   * The front desk. Holds the whole booking lifecycle including check-in and
   * check-out, and can see housekeeping without being able to close a task —
   * knowing whether 204 is ready is the receptionist's job; saying it is ready
   * is the housekeeper's.
   */
  receptionist: {
    displayName: 'Receptionist',
    description: 'Runs the front desk: arrivals, departures and changes',
    scopes: ['rooms:read', 'bookings', 'housekeeping:read'],
  },
  /**
   * Holds `housekeeping:complete` and no booking scope at all. The pairing with
   * `receptionist` is the seam worth having: two roles that both work on the
   * same room and can each do something the other cannot.
   */
  housekeeper: {
    displayName: 'Housekeeper',
    description: 'Cleans rooms and closes their own tasks',
    scopes: ['rooms:read', 'housekeeping:read', 'housekeeping:complete'],
  },
  /**
   * Names the parents rather than their children — the parent-grant rule means
   * `bookings` covers every scope beneath it, so this does not need rewriting
   * each time the tree grows. `pikku:console` comes from the console addon,
   * and `virtualUser` from the virtual-user scaffold, whose RPCs no role could
   * otherwise reach. Parents are granted rather than `virtualUser:*`: a
   * wildcard has no row in pikku_scopes for pikku_role_scopes to reference.
   */
  manager: {
    displayName: 'Manager',
    description: 'Everything the hotel can do, plus console administration',
    scopes: [
      'rooms',
      'bookings',
      'housekeeping',
      'reports',
      'pikku:console',
      'virtualUser',
    ],
  },
})
// @snippet end defineRoles
