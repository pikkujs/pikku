import { defineFeatureFlags, defineVirtualUsers, defineAnalyticsEvents, defineContributors } from '@pikku/core'
import { devContrib, notExported } from './contrib.js'

const beta = { description: 'Beta', anyOf: ['a:read', 'b:write'] }
const dead = { anyOf: [] }
const nonArr = { anyOf: 'a' }
const mixed = { anyOf: ['ok', computed()] }
export const flags = defineFeatureFlags({
  newCheckout: { description: 'The new checkout' },
  beta,
  dead,
  nonArr,
  mixed,
  'bad:name': {},
  ['computed']: {},
  oops: 5,
  '': {},
})
function computed(): string { return 'x' }

export const users = defineVirtualUsers({
  ada: {
    name: 'Ada',
    roles: ['admin'],
    goals: ['ship'],
    disposition: 'careless',
    jobTitle: 'Engineer',
    tuning: { moves: { continue: 3, abandon: 0.5 }, temperature: 1.5, repeatRate: 0.2, emptyMemory: true, instructions: 'be brief' },
    account: { provider: 'google' },
    linkedAccounts: { github: {}, google: { provider: 'google' }, bad: 3 },
    fixtures: ['f1'],
    environments: ['dev'],
  },
  bob: { name: 'Bob', runnable: false },
  cy: { name: 'Cy', disposition: 'nope' },
  di: { name: '' },
  ed: { name: 'Ed', tuning: { temperature: 9, moves: { suspend: -1 } } },
  fay: 7,
})
defineVirtualUsers({ gus: { name: 'Gus' } })

export const events = defineAnalyticsEvents({
  signup: z.object({ plan: z.string(), seats: z.number().optional() }),
  login,
  'page-view': z.object({ path: z.string() }).strict(),
})
const hidden = defineAnalyticsEvents({ ghost: z.object({}) })
export const dup = defineAnalyticsEvents({ signup: z.object({}) })
export const empty = defineAnalyticsEvents({})
export const notLit = defineAnalyticsEvents(config)
declare const z: any, login: any, config: any

export const contributors = defineContributors({
  logger: { dev: devContrib, deploy: devContrib },
  alone: { dev: devContrib },
  bad: { dev: notExported },
  inline: { dev: () => 1 },
  neither: {},
  extra: { staging: devContrib },
  dupe: { dev: devContrib },
})
defineContributors({ logger: { dev: devContrib } })
defineContributors({ ['c' + 1]: { dev: devContrib } })
