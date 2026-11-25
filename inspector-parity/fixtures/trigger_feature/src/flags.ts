import {
  defineFeatureFlags,
  defineVirtualUsers,
  defineAnalyticsEvents,
} from '@pikku/core'
import { defineProvider } from '@pikku/core/provider'
import {
  devVariant,
  devVariantTwo,
  notAFunction,
  notExported,
} from './service-dev.js'
import { deployVariant } from './service-deploy.js'

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
function computed(): string {
  return 'x'
}

export const users = defineVirtualUsers({
  ada: {
    name: 'Ada',
    roles: ['admin'],
    goals: ['ship'],
    disposition: 'careless',
    jobTitle: 'Engineer',
    tuning: {
      moves: { continue: 3, abandon: 0.5 },
      temperature: 1.5,
      repeatRate: 0.2,
      emptyMemory: true,
      instructions: 'be brief',
    },
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

declare const dynamic: any

// Variants given by reference live in their own modules.
export const queue = defineProvider({ dev: devVariant, deploy: deployVariant })
// One factory is the same on every target; needs are the destructured names.
export const aliased = defineProvider(({ kysely: db, logger }) => {
  logger.info('aliased')
  return { aliased: db }
})
export const clock = defineProvider({
  common: () => ({ clock: () => 0 }),
  dev: ({ logger }) => ({ clock: () => logger }),
  onServerStart(services) {
    void services
  },
})
// PKU375: both variants are exported from the same module.
export const twin = defineProvider({ dev: devVariant, deploy: devVariantTwo })
// PKU369
const hidden = defineProvider(() => ({ hidden: 1 }))
void hidden
export const fromDynamic = defineProvider(dynamic)
export const neither = defineProvider({})
export const stray = defineProvider({ prod: () => ({}) })
export const unresolved = defineProvider({ dev: notExported })
export const notInline = defineProvider({ dev: notAFunction })
export const shorthand = defineProvider({ dev: devVariant, deploy })
defineProvider(() => ({ loose: 1 }))
// PKU371
export const whole = defineProvider((services) => ({ whole: services }))
export const rest = defineProvider(({ logger, ...others }) => ({
  logger,
  others,
}))
// PKU372
export const untyped = defineProvider(() => dynamic)
