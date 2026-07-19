import { wireScope } from '#pikku/pikku-types.gen.js'

wireScope({
  reports: {
    displayName: 'Reports',
    description: 'Reporting access',
    scopes: {
      read: { description: 'Read reports' },
    },
  },
})
