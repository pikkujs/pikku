import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Workflow runs, their steps, per-step history and the versioned graphs.
 *
 * Two things from the boot-time DDL are deliberately not carried over. The
 * primary keys had `defaultTo(sql.raw("'" + crypto.randomUUID() + "'"))`, which
 * evaluates once while the statement is built — every row would have taken the
 * same default, so it was never a generator; the services supply the id. And
 * `workflowStep.fromStepName`, `workflowStep.currentAttempt` and
 * `workflowStepHistory.attempt` were each backfilled by an
 * `alterTable(...).catch(() => {})` bolted on after the fact, which is the job a
 * migration does — they are declared here and nowhere else.
 *
 * `KyselyWorkflowMirror` created these same four tables separately. There is one
 * declaration now, and both services read it.
 */
export const workflowSchema: PikkuSchema = {
  name: 'workflow',
  wiredBy: 'workflow',
  statements: [
    (db) =>
      db.schema
        .createTable('workflowRuns')
        .addColumn('workflowRunId', 'text', (col) => col.primaryKey())
        .addColumn('workflow', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('input', 'text', (col) => col.notNull())
        .addColumn('output', 'text')
        .addColumn('error', 'text')
        .addColumn('state', 'text', (col) => col.defaultTo('{}'))
        .addColumn('inline', 'boolean', (col) => col.defaultTo(false))
        .addColumn('graphHash', 'text')
        .addColumn('deterministic', 'boolean', (col) => col.defaultTo(false))
        .addColumn('plannedSteps', 'text')
        .addColumn('wire', 'text')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('workflowStep')
        .addColumn('workflowStepId', 'text', (col) => col.primaryKey())
        .addColumn('workflowRunId', 'text', (col) =>
          col
            .notNull()
            .references('workflowRuns.workflowRunId')
            .onDelete('cascade')
        )
        .addColumn('stepName', 'text', (col) => col.notNull())
        .addColumn('rpcName', 'text')
        .addColumn('data', 'text')
        .addColumn('status', 'text', (col) =>
          col.notNull().defaultTo('pending')
        )
        .addColumn('result', 'text')
        .addColumn('error', 'text')
        .addColumn('childRunId', 'text')
        .addColumn('branchTaken', 'text')
        .addColumn('retries', 'integer')
        .addColumn('retryDelay', 'text')
        .addColumn('fromStepName', 'text')
        .addColumn('currentAttempt', 'integer')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addUniqueConstraint('workflow_step_run_name_unique', [
          'workflowRunId',
          'stepName',
        ]),

    (db) =>
      db.schema
        .createTable('workflowStepHistory')
        .addColumn('historyId', 'text', (col) => col.primaryKey())
        .addColumn('workflowStepId', 'text', (col) =>
          col
            .notNull()
            .references('workflowStep.workflowStepId')
            .onDelete('cascade')
        )
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('result', 'text')
        .addColumn('error', 'text')
        .addColumn('attempt', 'integer')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('runningAt', 'timestamp')
        .addColumn('scheduledAt', 'timestamp')
        .addColumn('succeededAt', 'timestamp')
        .addColumn('failedAt', 'timestamp'),

    (db) =>
      db.schema
        .createTable('workflowVersions')
        .addColumn('workflowName', 'text', (col) => col.notNull())
        .addColumn('graphHash', 'text', (col) => col.notNull())
        .addColumn('graph', 'text', (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('workflow_versions_pk', [
          'workflowName',
          'graphHash',
        ]),

    // The indexes trail the tables so that a table is never indexed before it
    // exists, whatever order the declarations are read in.
    (db) =>
      db.schema
        .createIndex('idx_workflow_runs_status_created')
        .on('workflowRuns')
        .columns(['status', 'createdAt']),

    (db) =>
      db.schema
        .createIndex('idx_workflow_runs_workflow_created')
        .on('workflowRuns')
        .columns(['workflow', 'createdAt']),

    (db) =>
      db.schema
        .createIndex('idx_workflow_step_run_status')
        .on('workflowStep')
        .columns(['workflowRunId', 'status']),

    (db) =>
      db.schema
        .createIndex('idx_workflow_step_history_step')
        .on('workflowStepHistory')
        .columns(['workflowStepId', 'createdAt']),

    (db) =>
      db.schema
        .createIndex('idx_workflow_versions_source_status')
        .on('workflowVersions')
        .columns(['source', 'status']),
  ],
}
