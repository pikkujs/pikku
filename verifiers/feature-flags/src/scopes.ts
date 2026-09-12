import { defineScope } from '#pikku/scopes'

defineScope({
  sandboxes: {
    displayName: 'Sandboxes',
    scopes: {
      read: { description: 'Open a sandbox' },
      admin: { description: 'Administer sandboxes' },
    },
  },
  billing: {
    scopes: {
      read: { description: 'Read billing data' },
    },
  },
})
