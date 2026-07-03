import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

/**
 * Uses only default services (logger) — a consumer unit deploying just this
 * function needs neither the addon services factory nor any of the addon's
 * requiredParentServices.
 */
export const goodbye = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  description: 'Sends a farewell message',
  func: async ({ logger }, data) => {
    const message = `Goodbye, ${data.name}!`
    logger.info(`Addon: ${message}`)
    return { message }
  },
  tags: ['addon'],
})
