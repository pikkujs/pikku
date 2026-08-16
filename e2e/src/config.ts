import { LogLevel } from '@pikku/core/services'

import { pikkuConfig } from '#pikku/function'

export const createConfig = pikkuConfig(async () => ({
  port: Number(process.env.PORT ?? 4002),
  hostname: '0.0.0.0',
  logLevel: LogLevel.warn,
  // The webhook roundtrip test points a delivery at this app's own sink route,
  // which the outbound SSRF guard blocks as a private host unless the host is
  // allowlisted. Allowing only loopback keeps the guard doing its job for
  // every other destination.
  webhook: { allowedHosts: ['localhost', '127.0.0.1'] },
}))
