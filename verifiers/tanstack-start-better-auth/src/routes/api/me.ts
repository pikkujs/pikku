import { createFileRoute } from '@tanstack/react-router'
import { getAuthSession } from '@pikku/better-auth'
import { auth } from '../../auth.js'
import { createConfig, createSingletonServices } from '../../services.js'

export const Route = createFileRoute('/api/me')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getAuthSession(
          auth,
          request,
          createConfig,
          createSingletonServices
        )

        return Response.json(
          { email: session?.user?.email ?? null },
          { status: session?.user ? 200 : 401 }
        )
      },
    },
  },
})
