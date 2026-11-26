import { pikkuService } from '@pikku/core/pikku-service'
import { inbox as shopInbox } from './services/inbox.js'
import { billingDev } from './services/billing-dev.js'
import { billingDeploy } from './services/billing-deploy.js'
import { twinDev, twinDeploy } from './services/twin-variants.js'

declare const dynamic: any
declare const someFactory: () => any

export { shopInbox }

// One factory is the same on every target: a single `common` variant.
export const cache = pikkuService(({ kysely }) => ({ cache: kysely }))

// A target variant beside `common`, and an onServerStart on the object form.
export const clock = pikkuService({
  common: () => ({ clock: () => 0 }),
  dev: ({ logger }) => ({ clock: () => logger }),
  onServerStart(services) {
    void services
  },
})

// Each variant given by reference lives in its own module.
export const billing = pikkuService({
  dev: billingDev,
  deploy: billingDeploy,
})

// PKU375: both variants are exported from the same module.
export const twin = pikkuService({ dev: twinDev, deploy: twinDeploy })

// Needs are the destructured names, not the local aliases; a factory that
// returns nothing provides nothing.
export const aliased = pikkuService(({ kysely: db, logger }) => {
  void db
  logger.info('aliased')
})

// PKU369: not exported, so a host cannot import it.
const hidden = pikkuService(() => ({ hidden: 1 }))
void hidden
// PKU369: neither a function nor an object of variants.
export const fromDynamic = pikkuService(dynamic)
// PKU369: an object that declares no variant.
export const neither = pikkuService({})
// PKU369: only dev, deploy, common and onServerStart.
export const stray = pikkuService({ prod: () => ({}) })
// PKU369: a variant given by reference has to be an exported const.
export const byReference = pikkuService({ dev: someFactory })
// PKU369: the call has to be the initializer of a const.
pikkuService(() => ({ loose: 1 }))
// PKU371: the services parameter has to be destructured.
export const whole = pikkuService((services) => ({ whole: services }))
// PKU371: a rest element collects names the build cannot read.
export const rest = pikkuService(({ logger, ...others }) => ({ logger, others }))
// PKU372: the return type has to be an object with known keys.
export const untyped = pikkuService(() => dynamic)
export const either = pikkuService(() => (dynamic ? { a: 1 } : { b: 2 }))
// PKU376: the exported name inbox is already taken by ./services/inbox.ts.
export const inbox = pikkuService(() => ({ inbox: 1 }))
