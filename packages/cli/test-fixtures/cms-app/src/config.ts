import { pikkuConfig } from '#pikku/setup'

export const createConfig = pikkuConfig(async () => ({
  sqliteDb: '.pikku-runtime/dev.db',
}))
