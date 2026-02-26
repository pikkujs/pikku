import { pikkuConfig } from '#pikku/pikku-types.gen.js'

export const createConfig = pikkuConfig(async () => ({
  port: 4003,
  hostname: '0.0.0.0',
  apiKey: process.env.REGISTRY_API_KEY ?? 'test-key',
}))
