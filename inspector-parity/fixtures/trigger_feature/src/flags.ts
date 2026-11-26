import {
  defineFeatureFlags,
  defineVirtualUsers,
  defineAnalyticsEvents,
} from '@pikku/core'
import { pikkuService } from '@pikku/core/pikku-service'
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
export const queue = pikkuService({ dev: devVariant, deploy: deployVariant })
// One factory is the same on every target; needs are the destructured names.
export const aliased = pikkuService(({ kysely: db, logger }) => {
  void db
  logger.info('aliased')
})
export const clock = pikkuService({
  common: () => ({ clock: () => 0 }),
  dev: ({ logger }) => ({ clock: () => logger }),
  onServerStart(services) {
    void services
  },
})
// PKU375: both variants are exported from the same module.
export const twin = pikkuService({ dev: devVariant, deploy: devVariantTwo })
// PKU369
const hidden = pikkuService(() => ({ hidden: 1 }))
void hidden
export const fromDynamic = pikkuService(dynamic)
export const neither = pikkuService({})
export const stray = pikkuService({ prod: () => ({}) })
export const unresolved = pikkuService({ dev: notExported })
export const notInline = pikkuService({ dev: notAFunction })
export const shorthand = pikkuService({ dev: devVariant, deploy })
pikkuService(() => ({ loose: 1 }))
// PKU371
export const whole = pikkuService((services) => ({ whole: services }))
export const rest = pikkuService(({ logger, ...others }) => ({
  logger,
  others,
}))
// PKU372
export const untyped = pikkuService(() => dynamic)
