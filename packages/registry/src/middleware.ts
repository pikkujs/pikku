import { addHTTPMiddleware } from '#pikku/pikku-types.gen.js'
import { cors } from '@pikku/core/middleware'

addHTTPMiddleware('*', [cors({})])
