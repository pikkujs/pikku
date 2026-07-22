import { createFileRoute } from '@tanstack/react-router'
import { toTanStackStartAuthHandler } from '@pikku/tanstack-start'
import { auth } from '../../../auth.js'
import { createConfig, createSingletonServices } from '../../../services.js'

const authHandler = toTanStackStartAuthHandler(
  auth,
  createConfig,
  createSingletonServices
)

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return await authHandler({ request })
      },
      POST: async ({ request }: { request: Request }) => {
        return await authHandler({ request })
      },
    },
  },
})
