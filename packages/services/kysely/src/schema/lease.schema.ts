import type { PikkuSchema } from './pikku-schema.types.js'

export const leaseSchema: PikkuSchema = {
  name: 'lease',
  ownedBy: ['leaseService', 'workflowService'],
  tables: {
    pikkuLease: {
      columns: {
        key: { type: 'key', primaryKey: true },
        holder: { type: 'text', required: true },
        token: { type: 'integer', required: true },
        expiresAt: { type: 'bigint', required: true },
      },
    },
  },
}
