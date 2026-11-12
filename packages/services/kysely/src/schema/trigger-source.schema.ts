import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * What each declared trigger source registered with its provider. `state` holds provider identifiers only: a signing secret a
 * provider issues goes to the credential service.
 */
export const triggerSourceSchema: PikkuSchema = {
  name: 'trigger-source',
  ownedBy: ['triggerSourceStore'],
  tables: {
    pikkuTriggerSource: {
      columns: {
        name: { type: 'key', primaryKey: true },
        kind: { type: 'text', required: true },
        baseUrl: { type: 'text' },
        labelPrefix: { type: 'text' },
        declared: { type: 'boolean', required: true, default: true },
        enabled: { type: 'boolean', required: true, default: false },
        status: { type: 'text' },
        state: { type: 'text' },
        detail: { type: 'text' },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
  },
}
