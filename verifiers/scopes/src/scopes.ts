import { wireScope } from '#pikku'

wireScope({
  name: 'admin',
  displayName: 'Administration',
  description: 'Administrative access',
  scopes: {
    invoices: {
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
})

wireScope({
  name: 'billing',
  displayName: 'Billing',
  scopes: {
    read: { description: 'Read billing data' },
  },
})
