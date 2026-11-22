import { defineVirtualUsers } from '#pikku/scopes/pikku-virtual-users.gen.js'

/**
 * A virtual user that names the root's `local` environment. The main
 * package's config holds only its marker, so its pass resolves `local` from
 * the root pikku.config.json.
 */
defineVirtualUsers({
  saboteur: {
    name: 'Saboteur',
    jobTitle: 'Tester',
    account: {},
    environments: ['local'],
  },
})
