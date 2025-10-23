import { wireHTTP } from './pikku-types.gen.js'
import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

/**
 * Progressive enhancement example with optional SSE
 * Works as regular HTTP GET, but also supports SSE
 */
export const statusCheck = pikkuSessionlessFunc<
  void,
  { state: 'initial' | 'pending' | 'done' }
>({
  auth: false,
  expose: true,
  docs: {
    summary: 'Status check with progressive enhancement',
    description: 'Returns initial status, with optional SSE updates',
    tags: ['status', 'sse'],
    errors: [],
  },
  // ✅ CORRECT: Check if channel exists for progressive enhancement
  func: async (services) => {
    // If channel exists (SSE), send incremental updates
    if (services?.channel) {
      setTimeout(() => services.channel?.send({ state: 'pending' }), 2500)
      setTimeout(() => services.channel?.send({ state: 'done' }), 5000)
    }

    // Always return initial response (works for both HTTP and SSE)
    return { state: 'initial' }
  },
})

/**
 * Wire the function with SSE support
 * GET /status/http
 * Accept: text/event-stream (for SSE) or application/json (for regular HTTP)
 */
wireHTTP({
  auth: false,
  method: 'get',
  route: '/status/http',
  func: statusCheck,
  sse: true, // Enable SSE support - MUST be GET method
})
