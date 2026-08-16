import { defineScope } from '#pikku/scopes'

defineScope({
  admin: {
    displayName: 'Administration',
    description: 'Administrative access',
    scopes: {
      invoices: {
        displayName: 'Invoice Management',
        description: 'Invoice management',
        scopes: {
          create: { description: 'Create invoices' },
          void: { description: 'Void invoices' },
        },
      },
      users: {
        description: 'User management',
      },
    },
  },
  billing: {
    displayName: 'Billing',
    scopes: {
      read: { description: 'Read billing data' },
    },
  },
})
