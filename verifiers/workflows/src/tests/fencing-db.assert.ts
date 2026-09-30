/**
 * Step-write fencing against real databases.
 *
 * A dispatch whose lease lapsed wakes up after its step was claimed again. The
 * shared fencing suite races it against the attempt that replaced it; PGlite
 * runs one statement at a time, so only a real server shows whether the two
 * writes stay fenced when they genuinely overlap.
 *
 * Postgres comes from `DATABASE_URL` and gets a schema of its own, so the
 * tables `pikku db migrate` made for the other runners are left alone. MySQL
 * comes from `MYSQL_URL`, whose tables are created here because pikku ships no
 * MySQL migrations.
 */
import { after } from 'node:test'
import { CamelCasePlugin, Kysely, MysqlDialect, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { createPool } from 'mysql2'
import { defineServiceTests } from '@pikku/core/testing'
import type { WorkflowFencingHarness } from '@pikku/core/testing'
import type { KyselyWorkflowService } from '@pikku/kysely'
import { applyPikkuSchemas, workflowSchema } from '@pikku/kysely'
import { PgKyselyWorkflowService } from '@pikku/kysely-postgres'
import { MySQLKyselyWorkflowService } from '@pikku/kysely-mysql'

const pgUrl =
  process.env.DATABASE_URL ??
  'postgres://postgres:password@localhost:5432/pikku_queue'
const mysqlUrl =
  process.env.MYSQL_URL ?? 'mysql://root:password@localhost:3306/pikku_leases'

const PG_SCHEMA = 'pikku_fencing'

const pgSql = postgres(pgUrl, { connection: { search_path: PG_SCHEMA } })
const pg = new Kysely<any>({
  dialect: new PostgresJSDialect({ postgres: pgSql }),
  plugins: [new CamelCasePlugin()],
})
const mysql = new Kysely<any>({
  dialect: new MysqlDialect({ pool: createPool(mysqlUrl) as any }),
  plugins: [new CamelCasePlugin()],
})

after(async () => {
  await pg.destroy()
  await mysql.destroy()
})

const harness = (
  db: Kysely<any>,
  service: KyselyWorkflowService
): WorkflowFencingHarness => ({
  service,
  // Epoch 1ms is in the past on every clock, the database's included.
  lapseLease: async (runId, stepName) => {
    await db
      .updateTable('workflowStep')
      .set({ leaseExpiresAt: 1 })
      .where('workflowRunId', '=', runId)
      .where('stepName', '=', stepName)
      .execute()
  },
})

let pgReady: Promise<void> | undefined
const migratePostgres = async () => {
  await sql`drop schema if exists ${sql.id(PG_SCHEMA)} cascade`.execute(pg)
  await sql`create schema ${sql.id(PG_SCHEMA)}`.execute(pg)
  await applyPikkuSchemas(pg, [workflowSchema])
}

let mysqlReady: Promise<void> | undefined
const migrateMysql = async () => {
  for (const table of [
    'workflow_step_history',
    'workflow_step',
    'workflow_runs',
  ]) {
    await sql`drop table if exists ${sql.table(table)}`.execute(mysql)
  }
  await sql`
    create table workflow_runs (
      workflow_run_id varchar(255) primary key,
      workflow text not null,
      status varchar(32) not null,
      input text not null,
      output text,
      error text,
      state text,
      \`inline\` boolean default false,
      graph_hash text,
      \`deterministic\` boolean default false,
      planned_steps text,
      wire text,
      created_at timestamp(3) not null default current_timestamp(3),
      updated_at timestamp(3) not null default current_timestamp(3)
    )
  `.execute(mysql)
  await sql`
    create table workflow_step (
      workflow_step_id varchar(255) primary key,
      workflow_run_id varchar(255) not null,
      step_name varchar(255) not null,
      rpc_name text,
      data text,
      status varchar(32) not null default 'pending',
      result text,
      error text,
      child_run_id text,
      branch_taken text,
      retries integer,
      retry_delay text,
      from_step_name text,
      current_attempt integer,
      lease_expires_at bigint,
      created_at timestamp(3) not null default current_timestamp(3),
      updated_at timestamp(3) not null default current_timestamp(3),
      unique (workflow_run_id, step_name)
    )
  `.execute(mysql)
  await sql`
    create table workflow_step_history (
      history_id varchar(255) primary key,
      workflow_step_id varchar(255) not null,
      status varchar(32) not null,
      result text,
      error text,
      attempt integer,
      created_at timestamp(3) not null default current_timestamp(3),
      running_at timestamp(3) null,
      scheduled_at timestamp(3) null,
      succeeded_at timestamp(3) null,
      failed_at timestamp(3) null,
      index (workflow_step_id)
    )
  `.execute(mysql)
}

defineServiceTests({
  name: 'postgres',
  services: {
    workflowFencing: async () => {
      await (pgReady ??= migratePostgres())
      const service = new PgKyselyWorkflowService(pg)
      await service.init()
      return harness(pg, service)
    },
  },
})

defineServiceTests({
  name: 'mysql',
  services: {
    workflowFencing: async () => {
      await (mysqlReady ??= migrateMysql())
      const service = new MySQLKyselyWorkflowService(mysql)
      await service.init()
      return harness(mysql, service)
    },
  },
})
