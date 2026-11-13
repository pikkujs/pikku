import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * The `virtualUserSchedule` table {@link KyselyVirtualUserScheduleStore} writes
 * to: one row per virtual user that keeps using the app on its own.
 *
 * Its own schema rather than a third table in {@link virtualUserSchema}, and
 * owned by its own store: recording what a virtual user did and deciding that it
 * keeps going on its own are separate opt-ins, and a project that only wants
 * the first should not be handed a cadence table it never writes to.
 *
 * `virtualUserId` is the primary key: a virtual user has one cadence, and a second row for
 * the same one would mean two copies of the same user acting at once — not a
 * heavier test, a different and unreproducible one.
 */
export const virtualUserScheduleSchema: PikkuSchema = {
  name: 'virtual-user-schedule',
  ownedBy: ['virtualUserScheduleStore'],
  tables: {
    virtualUserSchedule: {
      columns: {
        virtualUserId: { type: 'string(255)', primaryKey: true },
        // 0 or 1 rather than a boolean, matching the run tables: a bare sqlite
        // driver cannot bind one, and `SerializePlugin` is not installed
        // everywhere. Off by default, so creating the table spends nothing.
        enabled: { type: 'integer', required: true, default: 0 },
        disposition: { type: 'string(50)', required: true },
        goals: { type: 'text', required: true, default: '[]' },
        budget: { type: 'text' },
        // The gap to the next run is drawn between these rather than fixed, so
        // the virtual user does not keep an appointment.
        minIntervalMs: { type: 'bigint', required: true },
        maxIntervalMs: { type: 'bigint', required: true },
        // The entire schedule. Written before a run is dispatched, so a tick
        // that dies halfway cannot leave the row due for the next one.
        nextRunAt: { type: 'timestamp', required: true },
        lastRunId: { type: 'string(36)' },
        lastRunAt: { type: 'timestamp' },
      },
      // The only read that matters at speed: which rows are due, on every tick.
      indexes: [
        {
          name: 'idx_virtual_user_schedule_due',
          columns: ['enabled', 'nextRunAt'],
        },
      ],
    },
  },
}
