import { defineScope, declareScopes, defineSystemRole } from '@pikku/core/scope'

export const scopes = defineScope({
  billing: {
    displayName: 'Billing',
    description: 'Money',
    scopes: {
      invoices: {
        displayName: 'Invoices',
        scopes: { read: {}, write: { description: 'Write' } },
      },
      '7': { description: 'numeric key' },
      'bad:seg': {},
      '*': {},
      '': {},
      notObject: 'x',
    },
  },
  ['computed' + 'Key']: {},
  'a:b': {},
  plain: 'nope',
  orders: {},
} as const)

declareScopes([
  'billing:invoices:read',
  'reports:view',
  'reports:view',
  'bad::id',
  '*',
  42 as any,
] as const)
declareScopes(notAnArray)

export const roles = defineSystemRole({
  admin: { displayName: 'Admin', scopes: ['billing', 'orders' as const] },
  viewer: { description: 'Read only', scopes: [] },
  broken: { scopes: [someVar] },
  noScopes: {},
  wrongShape: { scopes: 'billing' },
  'role:colon': { scopes: [] },
  '': { scopes: [] },
  notObj: 3,
} satisfies Record<string, unknown>)

declare const notAnArray: string[]
declare const someVar: string
