import { pikkuConfig } from '#pikku/setup'

export const createConfig = pikkuConfig(async (variables) => ({
  port: Number(variables?.get('API_PORT') ?? 4021),
  hostname: String(variables?.get('HOST') ?? '0.0.0.0'),
}))
