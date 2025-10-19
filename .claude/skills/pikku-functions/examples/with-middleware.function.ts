import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { auditLog, rateLimit } from '../middleware.js'
import type { Order } from '../types.js'

/**
 * Function with middleware
 * Middleware wraps the function execution for cross-cutting concerns
 */
export const createOrder = pikkuFunc<{ items: string[]; total: number }, Order>(
  {
    expose: true,
    docs: {
      summary: 'Create an order',
      description: 'Creates a new order with audit logging and rate limiting',
      tags: ['orders', 'create'],
      errors: ['ValidationError', 'RateLimitError'],
    },
    // ✅ CORRECT: Middleware attached as array property
    // Middleware executes before/after the function
    middleware: [
      rateLimit({ maxRequests: 10, windowMs: 60000 }),
      auditLog('order.created'),
    ],
    // ✅ CORRECT: Services destructured in parameter list
    func: async ({ store }, { items, total }) => {
      // Middleware has already run
      const order = await store.createOrder({ items, total })
      return order
    },
  }
)
