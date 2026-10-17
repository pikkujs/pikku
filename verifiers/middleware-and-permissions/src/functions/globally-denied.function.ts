import { pikkuVoidFunc } from '#pikku/function'

/** Refused by the global permission in `permissions/global.ts`. */
export const globallyDenied = pikkuVoidFunc({
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'globallyDenied', phase: 'execute' })
  },
  auth: false,
})
