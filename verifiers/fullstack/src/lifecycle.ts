import { pikkuServerLifecycle } from '@pikku/core/utils'
import { wireDataLock } from '@pikku/core/data-lock'
import { dataLock } from './data-lock.js'
import type { SingletonServices } from '../types/application-types.js'

export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  beforeStart: async ({ logger }) => {
    // The server boots locked: the passphrase arrives over HTTP from the
    // unlock screen, long after these services were built.
    const state = await dataLock.init()
    wireDataLock(dataLock)
    logger.info(`Note store is ${state}`)
  },
})
