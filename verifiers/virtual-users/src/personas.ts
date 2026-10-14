import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'

/**
 * One persona a virtual user can act as. `realistic` is the default disposition,
 * so the schedule rows below need not name one.
 */
definePersonas({
  guest: {
    name: 'Guest',
    jobTitle: 'Visitor',
    personality: 'Curious first-time visitor who clicks around',
    account: {},
    runnable: true,
    disposition: 'realistic',
  },
})
