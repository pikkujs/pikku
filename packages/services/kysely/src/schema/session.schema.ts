import type { PikkuSchema } from './pikku-schema.types.js'

/** Server-side session storage. */
export const sessionSchema: PikkuSchema = {
  name: 'session',
  tables: {
    pikkuUserSessions: {
      columns: {
        pikkuUserId: { type: 'key', primaryKey: true },
        session: { type: 'text', required: true },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
  },
}
