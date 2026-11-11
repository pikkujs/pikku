import { defineFeatureFlags as flags } from '@pikku/core/feature-flag'

const shared = { description: 'Shared body', anyOf: ['billing'] } as const
const defineFeatureFlags = (x: unknown) => x

export const declared = flags({
  newCheckout: { description: 'New checkout', anyOf: ['billing', 'orders'] },
  killSwitch: {},
  shared,
  aliased: shared,
  empty: { anyOf: [] },
  notArray: { anyOf: 'billing' },
  computedScope: { anyOf: [shared.description] },
  'flag:colon': {},
  unknownBody: someValue,
})

// a local helper of the same name is not pikku's
defineFeatureFlags({ local: {} })

declare const someValue: object
