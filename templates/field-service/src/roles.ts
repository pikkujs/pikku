import { defineSystemRole } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * Who may do it.
 *
 * The seam worth having here is `quotes:approve`. A technician drafts the quote
 * because they are the one standing in the plant room; nobody standing in the
 * plant room should be able to approve their own number. Splitting create from
 * approve is what makes the quote workflow's human gate mean anything.
 */
defineSystemRole({
  technician: {
    displayName: 'Technician',
    description: 'Works the jobs assigned to them and drafts quotes',
    scopes: [
      'jobs:read',
      'jobs:progress',
      'visits:read',
      'visits:log',
      'quotes:read',
      'quotes:create',
      'customers:read',
    ],
  },
  dispatcher: {
    displayName: 'Dispatcher',
    description: 'Raises work, assigns it and approves what it costs',
    scopes: ['jobs', 'visits', 'quotes', 'customers', 'reports'],
  },
  /**
   * The customer's own contact. Deliberately narrow: they read the jobs on
   * their own site and nothing else, which is enforced by permissions rather
   * than by the scope — the scope says "may read jobs", the permission says
   * "these jobs".
   */
  customerContact: {
    displayName: 'Customer contact',
    description: 'Reads the work raised against their own site',
    scopes: ['jobs:read', 'visits:read', 'quotes:read'],
  },
})
