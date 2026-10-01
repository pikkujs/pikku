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
  ownedBy: ['workflowService', 'workflowRunService'],
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('workflowRuns')
        .addColumn('workflowRunId', ctx.key, (col) => col.primaryKey())
        .addColumn('workflow', ctx.key, (col) => col.notNull())
        .addColumn('status', ctx.key, (col) => col.notNull())
        .addColumn('input', ctx.text, (col) => col.notNull())
        .addColumn('output', ctx.text)
        .addColumn('error', ctx.text)
        .addColumn('state', ctx.text, (col) =>
          col.defaultTo(ctx.defaultText('{}'))
        )
        .addColumn('inline', 'boolean', (col) => col.defaultTo(false))
        .addColumn('graphHash', ctx.key)
        .addColumn('deterministic', 'boolean', (col) => col.defaultTo(false))
        .addColumn('plannedSteps', ctx.text)
        .addColumn('wire', ctx.text)
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db, _types, ctx) =>
      db.schema
        .createTable('workflowStep')
        .addColumn('workflowStepId', ctx.key, (col) => col.primaryKey())
        .addColumn('workflowRunId', ctx.key, (col) =>
          ctx.references(col.notNull(), 'workflowRuns.workflowRunId')
        )
        .addColumn('stepName', ctx.key, (col) => col.notNull())
        .addColumn('rpcName', ctx.text)
        .addColumn('data', ctx.text)
        .addColumn('status', ctx.key, (col) =>
          col.notNull().defaultTo(ctx.defaultText('pending'))
        )
        .addColumn('result', ctx.text)
        .addColumn('error', ctx.text)
        .addColumn('childRunId', ctx.text)
        .addColumn('branchTaken', ctx.text)
        .addColumn('retries', 'integer')
        .addColumn('retryDelay', ctx.text)
        .addColumn('fromStepName', ctx.text)
        .addColumn('currentAttempt', 'integer')
        .addColumn('leaseExpiresAt', 'bigint')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addUniqueConstraint('workflow_step_run_name_unique', [
          'workflowRunId',
          'stepName',
        ])
        .$call(
          ctx.foreignKeys('workflowStep', {
            workflowRunId: 'workflowRuns.workflowRunId',
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createTable('workflowStepHistory')
        .addColumn('historyId', ctx.key, (col) => col.primaryKey())
        .addColumn('workflowStepId', ctx.key, (col) =>
          ctx.references(col.notNull(), 'workflowStep.workflowStepId')
        )
        .addColumn('status', ctx.key, (col) => col.notNull())
        .addColumn('result', ctx.text)
        .addColumn('error', ctx.text)
        .addColumn('attempt', 'integer')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('runningAt', 'timestamp')
        .addColumn('scheduledAt', 'timestamp')
        .addColumn('succeededAt', 'timestamp')
        .addColumn('failedAt', 'timestamp')
        .$call(
          ctx.foreignKeys('workflowStepHistory', {
            workflowStepId: 'workflowStep.workflowStepId',
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createTable('workflowVersions')
        .addColumn('workflowName', ctx.key, (col) => col.notNull())
        .addColumn('graphHash', ctx.key, (col) => col.notNull())
        .addColumn('graph', ctx.text, (col) => col.notNull())
        .addColumn('source', ctx.key, (col) => col.notNull())
        .addColumn('status', ctx.key, (col) =>
          col.notNull().defaultTo(ctx.defaultText('active'))
        )
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('workflow_versions_pk', [
          'workflowName',
          'graphHash',
        ]),

    // The indexes trail the tables so that a table is never indexed before it
    // exists, whatever order the declarations are read in.
    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_workflow_runs_status_created')
        .on('workflowRuns')
        .columns(['status', 'createdAt']),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_workflow_runs_workflow_created')
        .on('workflowRuns')
        .columns(['workflow', 'createdAt']),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_workflow_step_run_status')
        .on('workflowStep')
        .columns(['workflowRunId', 'status']),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_workflow_step_history_step')
        .on('workflowStepHistory')
        .columns(['workflowStepId', 'createdAt']),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_workflow_versions_source_status')
        .on('workflowVersions')
        .columns(['source', 'status']),
  ],
}
