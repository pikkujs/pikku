import { defineVirtualUsers } from '#pikku/scopes/pikku-virtual-users.gen.js'

defineVirtualUsers({
  ada: {
    name: 'Ada',
    jobTitle: 'Analyst',
    description: 'Runs the arithmetic scenario',
    roles: [],
    personality: 'Precise.',
    goals: ['Get the sums right'],
    account: {},
  },
})
