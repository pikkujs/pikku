import { addHTTPMiddleware } from '#pikku/pikku-types.gen.js'
import { cors } from '@pikku/core/middleware'
import { authBearer } from '@pikku/core/middleware'

addHTTPMiddleware('*', [cors({})])

addHTTPMiddleware('/api/ingest', [
  authBearer({
    token: {
      value: process.env.REGISTRY_API_KEY ?? 'test-key',
      userSession: { userId: 'registry-admin' },
    },
  }),
])
