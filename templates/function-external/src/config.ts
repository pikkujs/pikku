import { pikkuConfig } from '#pikku'

export const createConfig = pikkuConfig(async () => {
  return {
    customPrefix: process.env.EXTERNAL_PREFIX || '[EXT]',
    enableLogging: process.env.EXTERNAL_LOGGING !== 'false',
  }
})
