/**
 * The lock service against real databases.
 *
 * PGlite takes its clock from the JS process, so a worker whose clock is off
 * can only be exercised against a real server. Each lock service here runs the
 * whole `LockService` contract, then is raced and skewed: a lease is judged by
 * the database's clock, never by the clock of the worker asking.
 *
 * Postgres comes from `DATABASE_URL` and MySQL from `MYSQL_URL`. Both tables are
 * created here: nothing this app wires reaches `lockService`, so
 * `pikku db migrate` has no reason to, and pikku ships no MySQL migrations.
 */
import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, MysqlDialect, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { createPool } from 'mysql2'
import type { LockService } from '@pikku/core/services'
import { defineServiceTests } from '@pikku/core/testing'
import { PgKyselyLockService } from '@pikku/kysely-postgres'
import { MySQLKyselyLockService } from '@pikku/kysely-mysql'
import { connectionString } from '../config.js'

const mysqlUrl =
  process.env.MYSQL_URL ?? 'mysql://root:password@localhost:3306/pikku_locks'

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

after(async () => {
  await pg.destroy()
  await mysql.destroy()
})

const backends: Record<string, () => Promise<LockService>> = {
  postgres: async () => {
    await sql`
      create table if not exists pikku_lock (
        key text primary key,
        holder text not null,
        token integer not null,
        expires_at bigint not null
      )
    `.execute(pg)
    await pg.deleteFrom('pikkuLock').execute()
    return new PgKyselyLockService(pg)
  },
  mysql: async () => {
    await sql`
      create table if not exists pikku_lock (
        \`key\` varchar(255) primary key,
        holder text not null,
        token integer not null,
        expires_at bigint not null
      )
    `.execute(mysql)
    await mysql.deleteFrom('pikkuLock').execute()
    return new MySQLKyselyLockService(mysql)
  },
}

for (const [name, create] of Object.entries(backends)) {
  defineServiceTests({ name, services: { lockService: create } })

  describe(`a ${name} lock under contention`, () => {
    test('exactly one of many concurrent acquires wins', async () => {
      const locks = await create()
      const leases = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          locks.acquire('contended', `worker-${i}`, 60_000)
        )
      )
      assert.equal(leases.filter(Boolean).length, 1)
    })

    test('a worker with a fast clock cannot take a live lease', async () => {
      const locks = await create()
      assert.ok(await locks.acquire('skewed', 'worker-a', 60_000))

      const stolen = await withSkewedClock(() =>
        locks.acquire('skewed', 'worker-b', 60_000)
      )

      assert.equal(stolen, null, 'the lease was judged by the worker clock')
    })

    test('a worker with a fast clock does not make its lease outlive its ttl', async () => {
      const locks = await create()
      await withSkewedClock(() => locks.acquire('long', 'worker-a', 500))
      await new Promise((r) => setTimeout(r, 1_500))

      assert.ok(
        await locks.acquire('long', 'worker-b', 60_000),
        'a lease written by a fast clock stayed live past its ttl'
      )
    })
  })
}

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
      const locks = new MySQLKyselyLockService(session)

      await at(FIRST_0130)
      assert.ok(await locks.acquire('fall-back', 'worker-a', 60_000))

      await at(SECOND_0130)
      assert.ok(
        await locks.acquire('fall-back', 'worker-b', 60_000),
        'an hour later the lease still looked live: the clock went through the session time zone'
      )
    } finally {
      await session.destroy()
    }
  })
})
