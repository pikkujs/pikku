import { pikkuServerLifecycle } from '@pikku/core/utils'
import type { SingletonServices } from '../types/application-types.js'

export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  beforeStart: async ({ logger }) => {
    logger.info('Note store ready')
  },
})
