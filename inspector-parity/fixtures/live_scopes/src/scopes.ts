import { declareScopes, defineScope } from './declare.js'

const notALiteral = true

defineScope({
  admin: {
    description: 'Admin',
    scopes: {
      users: {
        description: 'Users',
        live: true,
        scopes: {
          ban: { description: 'Ban' },
          view: { description: 'View', live: false },
        },
      },
    },
  },
  root: {
    description: 'Root',
    live: true,
    scopes: { child: { description: 'Child' } },
  },
  plain: {
    description: 'Plain',
    scopes: {
      read: { description: 'Read' },
      // prettier-ignore
      quoted: { description: 'Quoted', 'live': true },
      computed: { description: 'Computed', live: notALiteral },
    },
  },
})

declareScopes(['root:added'])
