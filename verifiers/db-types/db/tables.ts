import { defineTables } from '@pikku/core/db'

export const tables = defineTables({
  note: {
    columns: {
      id: { type: 'uuid', primaryKey: true, default: { uuid: true } },
      views: { type: 'bigint', required: true, default: 0 },
      createdAt: { type: 'timestamp', required: true, default: { now: true } },
      updatedAt: {
        type: 'timestamp',
        required: true,
        default: { now: true },
        onUpdate: { now: true },
      },
    },
  },
})
