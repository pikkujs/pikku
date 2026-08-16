import { defineScope } from '#pikku/scopes'

defineScope({
  reports: {
    displayName: 'Reports',
    description: 'Reporting access',
    scopes: {
      read: { description: 'Read reports' },
    },
  },
})
