import { defineVirtualUsers } from '#pikku/scopes/pikku-virtual-users.gen.js'

/**
 * One virtual user. `realistic` is the default disposition,
 * so the schedule rows below need not name one.
 */
defineVirtualUsers({
  guest: {
    name: 'Guest',
    jobTitle: 'Visitor',
    personality: 'Curious first-time visitor who clicks around',
    account: {},
    runnable: true,
    disposition: 'realistic',
  },
})
