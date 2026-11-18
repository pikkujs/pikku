import type { PikkuSchema } from './pikku-schema.types.js'

export const rateLimitSchema: PikkuSchema = {
  name: 'rate-limit',
  ownedBy: ['rateLimitService'],
  tables: {
    pikkuRateLimit: {
      columns: {
        key: { type: 'key', primaryKey: true },
        count: { type: 'integer', required: true },
        resetAt: { type: 'bigint', required: true },
      },
    },
  },
}
