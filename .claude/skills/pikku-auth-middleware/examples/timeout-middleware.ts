import { timeout } from '@pikku/core/middleware'
import { addHTTPMiddleware, wireHTTP } from './pikku-types.gen.js'
import { exportData } from './functions/export.function.js'

/**
 * Timeout middleware examples
 *
 * Throws RequestTimeoutError if request takes longer than specified duration.
 */

// Global 30 second timeout for all HTTP requests
addHTTPMiddleware([timeout(30000)])

// Specific timeout for slow endpoint
wireHTTP({
  method: 'post',
  route: '/api/export',
  func: exportData,
  middleware: [timeout(300000)], // 5 minute timeout
})
