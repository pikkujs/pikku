import { cors } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '@pikku/core/http'

addHTTPMiddleware('*', [cors({ origin: true, credentials: true })])
