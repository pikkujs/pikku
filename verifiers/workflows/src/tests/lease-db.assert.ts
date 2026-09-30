/**
 * The lease service and the step lease against real databases.
 *
 * PGlite takes its clock from the JS process, so a worker whose clock is off
 * can only be exercised against a real server. Each lease service here runs the
 * whole `LeaseService` contract, then is raced and skewed: a lease is judged by
 * the database's clock, never by the clock of the worker asking.
 *
 * Postgres comes from `DATABASE_URL` (migrated by `pikku db migrate`); MySQL
 * from `MYSQL_URL`, whose table is created here because pikku ships no MySQL
 * migrations; Redis from `REDIS_URL`.
 */
import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, MysqlDialect, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { createPool } from 'mysql2'
import type { LeaseService } from '@pikku/core/services'
import { defineServiceTests } from '@pikku/core/testing'
import {
  PgKyselyLeaseService,
  PgKyselyWorkflowService,
} from '@pikku/kysely-postgres'
import { MySQLKyselyLeaseService } from '@pikku/kysely-mysql'
import { RedisLeaseService } from '@pikku/redis'
import { connectionString } from '../config.js'

const mysqlUrl =
  process.env.MYSQL_URL ?? 'mysql://root:password@localhost:3306/pikku_leases'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

const HOUR = 60 * 60 * 1000

/** Runs `fn` as a worker whose clock is an hour fast. */
const withSkewedClock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const realNow = Date.now
  Date.now = () => realNow() + HOUR
  try {
    return await fn()
  } finally {
    Date.now = realNow
  }
}

const pgSql = postgres(connectionString)
const pg = new Kysely<any>({
  dialect: new PostgresJSDialect({ postgres: pgSql }),
  plugins: [new CamelCasePlugin()],
})
const mysql = new Kysely<any>({
  dialect: new MysqlDialect({ pool: createPool(mysqlUrl) as any }),
  plugins: [new CamelCasePlugin()],
})

const redisLeases: RedisLeaseService[] = []

after(async () => {
  await pg.destroy()
  await mysql.destroy()
  await Promise.all(redisLeases.map((leases) => leases.close()))
})

const backends: Record<string, () => Promise<LeaseService>> = {
  postgres: async () => {
    await pg.deleteFrom('pikkuLease').execute()
    return new PgKyselyLeaseService(pg)
  },
  mysql: async () => {
    await sql`
      create table if not exists pikku_lease (
        \`key\` varchar(255) primary key,
        holder text not null,
        token integer not null,
        expires_at bigint not null
      )
    `.execute(mysql)
    await mysql.deleteFrom('pikkuLease').execute()
    return new MySQLKyselyLeaseService(mysql)
  },
  redis: async () => {
    const leases = new RedisLeaseService(redisUrl, {
      keyPrefix: `lease-db-${crypto.randomUUID()}`,
    })
    redisLeases.push(leases)
    return leases
  },
}

for (const [name, create] of Object.entries(backends)) {
  defineServiceTests({ name, services: { leaseService: create } })

  describe(`a ${name} lease under contention`, () => {
    test('exactly one of many concurrent acquires wins', async () => {
      const leases = await create()
      const won = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          leases.acquire('contended', `worker-${i}`, 60_000)
        )
      )
      assert.equal(won.filter(Boolean).length, 1)
    })

    test('a worker with a fast clock cannot take a live lease', async () => {
      const leases = await create()
      assert.ok(await leases.acquire('skewed', 'worker-a', 60_000))

      const stolen = await withSkewedClock(() =>
        leases.acquire('skewed', 'worker-b', 60_000)
      )

      assert.equal(stolen, null, 'the lease was judged by the worker clock')
    })

    test('a worker with a fast clock does not make its lease outlive its ttl', async () => {
      const leases = await create()
      await withSkewedClock(() => leases.acquire('long', 'worker-a', 500))
      await new Promise((r) => setTimeout(r, 1_500))

      assert.ok(
        await leases.acquire('long', 'worker-b', 60_000),
        'a lease written by a fast clock stayed live past its ttl'
      )
    })
  })
}

describe('a Postgres step lease under clock skew', () => {
  test('a worker with a fast clock cannot claim a step another holds', async () => {
    const service = new PgKyselyWorkflowService(pg)
    await service.init()
    const runId = await service.createRun('skew', {}, false, 'hash', {
      type: 'test',
    } as any)
    await service.insertStepState(runId, 'step-1', 'rpc.fn', {})
    const claim = () =>
      (service as any).claimStepForExecution(runId, 'step-1', 'rpc.fn', 60_000)

    assert.ok(await claim())
    const second = await withSkewedClock(claim)

    assert.equal(second, null, 'the step lease was judged by the worker clock')
  })
})

describe('a MySQL lease across a daylight-saving fall-back', () => {
  // 2026-11-01 01:30 in New York happens twice: 05:30 UTC, then 06:30 UTC.
  const FIRST_0130 = Date.UTC(2026, 10, 1, 5, 30) / 1000
  const SECOND_0130 = FIRST_0130 + HOUR / 1000

  test('a lease taken at the first 01:30 has lapsed by the second', async () => {
    await backends.mysql!()
    const session = new Kysely<any>({
      dialect: new MysqlDialect({
        pool: createPool({ uri: mysqlUrl, connectionLimit: 1 }) as any,
      }),
      plugins: [new CamelCasePlugin()],
    })
    const at = (epochSeconds: number) =>
      sql`set timestamp = ${sql.raw(String(epochSeconds))}`.execute(session)
    try {
      await sql`set time_zone = 'America/New_York'`.execute(session)
      const leases = new MySQLKyselyLeaseService(session)

      await at(FIRST_0130)
      assert.ok(await leases.acquire('fall-back', 'worker-a', 60_000))

      await at(SECOND_0130)
      assert.ok(
        await leases.acquire('fall-back', 'worker-b', 60_000),
        'an hour later the lease still looked live: the clock went through the session time zone'
      )
    } finally {
      await session.destroy()
    }
  })
})
