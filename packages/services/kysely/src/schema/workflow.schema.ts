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
  tables: {
    workflowRuns: {
      columns: {
        workflowRunId: { type: 'key', primaryKey: true },
        workflow: { type: 'key', required: true },
        status: { type: 'key', required: true },
        input: { type: 'text', required: true },
        output: { type: 'text' },
        error: { type: 'text' },
        state: { type: 'text', default: '{}' },
        inline: { type: 'boolean', default: false },
        graphHash: { type: 'key' },
        deterministic: { type: 'boolean', default: false },
        plannedSteps: { type: 'text' },
        wire: { type: 'text' },
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
      indexes: [
        {
          name: 'idx_workflow_runs_status_created',
          columns: ['status', 'createdAt'],
        },
        {
          name: 'idx_workflow_runs_workflow_created',
          columns: ['workflow', 'createdAt'],
        },
      ],
    },
    workflowStep: {
      columns: {
        workflowStepId: { type: 'key', primaryKey: true },
        workflowRunId: {
          type: 'key',
          required: true,
          references: 'workflowRuns.workflowRunId',
          onDelete: 'cascade',
        },
        stepName: { type: 'key', required: true },
        rpcName: { type: 'text' },
        data: { type: 'text' },
        status: { type: 'key', required: true, default: 'pending' },
        result: { type: 'text' },
        error: { type: 'text' },
        childRunId: { type: 'text' },
        branchTaken: { type: 'text' },
        retries: { type: 'integer' },
        retryDelay: { type: 'text' },
        fromStepName: { type: 'text' },
        currentAttempt: { type: 'integer' },
        leaseExpiresAt: { type: 'bigint' },
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
      unique: [
        {
          name: 'workflow_step_run_name_unique',
          columns: ['workflowRunId', 'stepName'],
        },
      ],
      indexes: [
        {
          name: 'idx_workflow_step_run_status',
          columns: ['workflowRunId', 'status'],
        },
      ],
    },
    workflowStepHistory: {
      columns: {
        historyId: { type: 'key', primaryKey: true },
        workflowStepId: {
          type: 'key',
          required: true,
          references: 'workflowStep.workflowStepId',
          onDelete: 'cascade',
        },
        status: { type: 'key', required: true },
        result: { type: 'text' },
        error: { type: 'text' },
        attempt: { type: 'integer' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        runningAt: { type: 'timestamp' },
        scheduledAt: { type: 'timestamp' },
        succeededAt: { type: 'timestamp' },
        failedAt: { type: 'timestamp' },
      },
      indexes: [
        {
          name: 'idx_workflow_step_history_step',
          columns: ['workflowStepId', 'createdAt'],
        },
      ],
    },
    workflowVersions: {
      columns: {
        workflowName: { type: 'key', required: true },
        graphHash: { type: 'key', required: true },
        graph: { type: 'text', required: true },
        source: { type: 'key', required: true },
        status: { type: 'key', required: true, default: 'active' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      primaryKey: ['workflowName', 'graphHash'],
      indexes: [
        {
          name: 'idx_workflow_versions_source_status',
          columns: ['source', 'status'],
        },
      ],
    },
  },
}
