import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * The `virtualUserSchedule` table {@link KyselyVirtualUserScheduleStore} writes
 * to: one row per persona that keeps using the app on its own.
 *
 * Its own schema rather than a third table in {@link virtualUserSchema}, and
 * owned by its own store: recording what a persona did and deciding that it
 * keeps going on its own are separate opt-ins, and a project that only wants
 * the first should not be handed a cadence table it never writes to.
 *
 * `persona` is the primary key: a persona has one cadence, and a second row for
 * the same one would mean two copies of the same user acting at once — not a
 * heavier test, a different and unreproducible one.
 */
export const virtualUserScheduleSchema: PikkuSchema = {
  name: 'virtual-user-schedule',
  ownedBy: ['virtualUserScheduleStore'],
  statements: [
    (db) =>
      db.schema
        .createTable('virtualUserSchedule')
        .addColumn('persona', 'varchar(255)', (col) => col.primaryKey())
        // 0 or 1 rather than a boolean, matching the run tables: a bare sqlite
        // driver cannot bind one, and `SerializePlugin` is not installed
        // everywhere. Off by default, so creating the table spends nothing.
        .addColumn('enabled', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('disposition', 'varchar(50)', (col) => col.notNull())
        .addColumn('goals', 'text', (col) => col.defaultTo('[]').notNull())
        .addColumn('budget', 'text')
        // The gap to the next run is drawn between these rather than fixed, so
        // the persona does not keep an appointment.
        .addColumn('minIntervalMs', 'bigint', (col) => col.notNull())
        .addColumn('maxIntervalMs', 'bigint', (col) => col.notNull())
        // The entire schedule. Written before a run is dispatched, so a tick
        // that dies halfway cannot leave the row due for the next one.
        .addColumn('nextRunAt', 'timestamp', (col) => col.notNull())
        .addColumn('lastRunId', 'varchar(36)')
        .addColumn('lastRunAt', 'timestamp'),

    // The only read that matters at speed: which rows are due, on every tick.
    (db) =>
      db.schema
        .createIndex('idx_virtual_user_schedule_due')
        .on('virtualUserSchedule')
        .columns(['enabled', 'nextRunAt']),
  ],
}
