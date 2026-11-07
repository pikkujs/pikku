import { pikkuConfig } from '#pikku/setup'

// @snippet start pikkuConfig
export const createConfig = pikkuConfig(async (variables) => ({
  port: Number(variables?.get('API_PORT') ?? 4013),
  hostname: String(variables?.get('HOST') ?? '0.0.0.0'),
}))
// @snippet end pikkuConfig
