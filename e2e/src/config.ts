import { LogLevel } from '@pikku/core/services'

import { pikkuConfig } from '#pikku/pikku-types.gen.js'

export const createConfig = pikkuConfig(async () => ({
  port: Number(process.env.PORT ?? 4002),
  hostname: '0.0.0.0',
  logLevel: LogLevel.warn,
}))
