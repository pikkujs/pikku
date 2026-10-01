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
 * comes from `MYSQL_URL`, whose tables are created here from the same declared
 * schema, as no migration runs for it. Redis comes from `REDIS_URL`, and each harness writes
 * under a key prefix of its own; ioredis-mock cannot stand in for it, as its
 * `hgetall` reply breaks under ioredis 6.
 */
import { after } from 'node:test'
import { CamelCasePlugin, Kysely, MysqlDialect, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { createPool } from 'mysql2'
import { Redis } from 'ioredis'
import { defineServiceTests } from '@pikku/core/testing'
import type { WorkflowFencingHarness } from '@pikku/core/testing'
import type { KyselyWorkflowService } from '@pikku/kysely'
import { applyPikkuSchemas, workflowSchema } from '@pikku/kysely'
import { InMemoryLeaseService } from '@pikku/core/services'
import { PgKyselyWorkflowService } from '@pikku/kysely-postgres'
import { MySQLKyselyWorkflowService } from '@pikku/kysely-mysql'
import { RedisWorkflowService } from '@pikku/redis'

const pgUrl =
  process.env.DATABASE_URL ??
  'postgres://postgres:password@localhost:5432/pikku_queue'
const mysqlUrl =
  process.env.MYSQL_URL ?? 'mysql://root:password@localhost:3306/pikku_leases'
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

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
const redis = new Redis(redisUrl)
const REDIS_PREFIX = `pikku-fencing-${process.pid}`

after(async () => {
  await pg.destroy()
  await mysql.destroy()
  const keys = await redis.keys(`${REDIS_PREFIX}-*`)
  if (keys.length > 0) await redis.del(...keys)
  redis.disconnect()
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
    'workflow_versions',
  ]) {
    await sql`drop table if exists ${sql.table(table)}`.execute(mysql)
  }
  await applyPikkuSchemas(mysql, [workflowSchema])
}

defineServiceTests({
  name: 'postgres',
  services: {
    workflowFencing: async () => {
      await (pgReady ??= migratePostgres())
      const service = new PgKyselyWorkflowService(pg, {
        leaseService: new InMemoryLeaseService(),
      })
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
      const service = new MySQLKyselyWorkflowService(mysql, {
        leaseService: new InMemoryLeaseService(),
      })
      await service.init()
      return harness(mysql, service)
    },
  },
})

let redisHarnesses = 0
defineServiceTests({
  name: 'redis',
  services: {
    workflowFencing: async () => {
      const keyPrefix = `${REDIS_PREFIX}-${++redisHarnesses}`
      const service = new RedisWorkflowService(redis, {
        keyPrefix,
        leaseService: new InMemoryLeaseService(),
      })
      return {
        service,
        lapseLease: async (runId, stepName) => {
          await redis.hset(
            `${keyPrefix}:step:${runId}:${stepName}`,
            'leaseExpiresAt',
            '1'
          )
        },
      }
    },
  },
})
