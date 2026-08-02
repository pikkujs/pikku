import { defineScope } from '#pikku/pikku-types.gen.js'

defineScope({
  reports: {
    displayName: 'Reports',
    description: 'Reporting access',
    scopes: {
      read: { description: 'Read reports' },
    },
  },
})
