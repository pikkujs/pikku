import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * The `virtualUserRun` table {@link KyselyVirtualUserRunStore} writes to.
 *
 * Deliberately not in `pikkuSchemas`: the runtime never needs this table, only
 * a project that runs virtual users does, and creating it for everyone would
 * put an empty table in every database. `KyselyVirtualUserRunStore.init()`
 * applies it, so it arrives exactly when the thing that fills it does.
 *
 * `persona` is text rather than a foreign key: personas are declared in code
 * with `definePersonas()`, not rows, and a run has to outlive the deletion of
 * the persona it ran as.
 *
 * The JSON columns are text on every engine, like the audit table's, because
 * the store serialises them itself — a project on SQLite and one on Postgres
 * then hold the same bytes, and comparing this week's findings against last
 * week's does not depend on which database they were found in.
 */
export const virtualUserSchema: PikkuSchema = {
  name: 'virtualUser',
  statements: [
    (db) =>
      db.schema
        .createTable('virtualUserRun')
        .addColumn('runId', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('persona', 'varchar(255)', (col) => col.notNull())
        .addColumn('disposition', 'varchar(50)', (col) => col.notNull())
        .addColumn('seed', 'bigint', (col) => col.notNull())
        // running | completed | failed. Not derived from `finishedAt` being
        // null: a crashed run has no finish time either, and "crashed" and
        // "still going" are not the same answer.
        .addColumn('status', 'varchar(50)', (col) =>
          col.defaultTo('running').notNull()
        )
        .addColumn('goals', 'text', (col) => col.defaultTo('[]').notNull())
        .addColumn('memory', 'text', (col) => col.defaultTo('{}').notNull())
        .addColumn('findings', 'text', (col) => col.defaultTo('[]').notNull())
        // Counts the engine kept: steps, calls, mutations, tokens, elapsed.
        .addColumn('tally', 'text')
        .addColumn('stoppedBy', 'varchar(255)')
        // Why the run itself failed, as opposed to what it found.
        .addColumn('error', 'text')
        .addColumn('startedBy', 'varchar(255)')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('finishedAt', 'timestamp'),

    // The two reads: the run list newest-first, and one persona's history when
    // a finding needs comparing against what that persona found before.
    (db) =>
      db.schema
        .createIndex('idx_virtual_user_run_created')
        .on('virtualUserRun')
        .column('createdAt'),

    (db) =>
      db.schema
        .createIndex('idx_virtual_user_run_persona')
        .on('virtualUserRun')
        .columns(['persona', 'createdAt']),
  ],
}
