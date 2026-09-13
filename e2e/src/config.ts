import { fileURLToPath } from 'node:url'
import { LogLevel } from '@pikku/core/services'

import { pikkuConfig } from '#pikku/setup'

export const createConfig = pikkuConfig(async () => ({
  port: Number(process.env.PORT ?? 4002),
  hostname: '0.0.0.0',
  logLevel: LogLevel.warn,
  // The webhook roundtrip test points a delivery at this app's own sink route,
  // which the outbound SSRF guard blocks as a private host unless the host is
  // allowlisted. Allowing only loopback keeps the guard doing its job for
  // every other destination.
  webhook: { allowedHosts: ['localhost', '127.0.0.1'] },
  // The browser scenarios need a frontend to drive, and this is the only one
  // in the repository that uses `@pikku/react` rather than the console's own
  // providers. Served beside the console rather than on its own port, so the
  // cookies the analytics identity resolver writes are same-origin.
  staticMounts: [
    {
      urlPrefix: '/app',
      directory: fileURLToPath(new URL('../packages/web/dist', import.meta.url)),
      spaFallback: true,
    },
  ],
}))
