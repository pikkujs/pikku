import { pikkuFuncSessionless } from '#pikku/pikku-types.gen.js'

/**
 * Sessionless health check function
 * No auth required, no session, exposed as public API
 */
export const health = pikkuFuncSessionless<void, { status: string }>({
  auth: false,
  expose: true,
  docs: {
    summary: 'Health check',
    description: 'Returns service health status',
    tags: ['health', 'monitoring'],
    errors: [],
  },
  // ✅ CORRECT: No services needed for this simple check
  func: async () => ({ status: 'ok' }),
})
