import { defineProvider } from '@pikku/core/provider'
import { inbox as shopInbox } from './services/inbox.js'
import { billingDev } from './services/billing-dev.js'
import { billingDeploy } from './services/billing-deploy.js'
import { twinDev, twinDeploy } from './services/twin-variants.js'

declare const dynamic: any
declare const someFactory: () => any

export { shopInbox }

// One factory is the same on every target: a single `common` variant.
export const cache = defineProvider(({ kysely }) => ({ cache: kysely }))

// A target variant beside `common`, and an onServerStart on the object form.
export const clock = defineProvider({
  common: () => ({ clock: () => 0 }),
  dev: ({ logger }) => ({ clock: () => logger }),
  onServerStart(services) {
    void services
  },
})

// Each variant given by reference lives in its own module.
export const billing = defineProvider({
  dev: billingDev,
  deploy: billingDeploy,
})

// PKU375: both variants are exported from the same module.
export const twin = defineProvider({ dev: twinDev, deploy: twinDeploy })

// Needs are the destructured names, not the local aliases.
export const aliased = defineProvider(({ kysely: db, logger }) => {
  logger.info('aliased')
  return { aliased: db }
})

// PKU380: a factory that returns nothing provides nothing.
export const nothing = defineProvider(({ logger }) => {
  logger.info('nothing')
})

// PKU369: not exported, so a host cannot import it.
const hidden = defineProvider(() => ({ hidden: 1 }))
void hidden
// PKU369: neither a function nor an object of variants.
export const fromDynamic = defineProvider(dynamic)
// PKU369: an object that declares no variant.
export const neither = defineProvider({})
// PKU369: only dev, deploy, common and onServerStart.
export const stray = defineProvider({ prod: () => ({}) })
// PKU369: a variant given by reference has to be an exported const.
export const byReference = defineProvider({ dev: someFactory })
// PKU369: the call has to be the initializer of a const.
defineProvider(() => ({ loose: 1 }))
// PKU371: the services parameter has to be destructured.
export const whole = defineProvider((services) => ({ whole: services }))
// PKU371: a rest element collects names the build cannot read.
export const rest = defineProvider(({ logger, ...others }) => ({ logger, others }))
// PKU372: the return type has to be an object with known keys.
export const untyped = defineProvider(() => dynamic)
// A union of objects is read: both keys, each optional.
export const either = defineProvider(() => (dynamic ? { a: 1 } : { b: 2 }))
// PKU376: the exported name inbox is already taken by ./services/inbox.ts.
export const inbox = defineProvider(() => ({ inbox: 1 }))
