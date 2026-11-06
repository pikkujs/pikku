/**
 * Sends signed, unsigned and forged jobs through real brokers. An adapter test
 * can pass while the job never crosses Redis or Postgres; this one cannot.
 *
 *   REDIS_PORT=6379 DATABASE_URL=postgres://... bun run test:queue-identity
 */
import assert from 'node:assert/strict'

import { createSecretValue } from '@pikku/core/classification'
import { SignedQueueService, wireQueueWorker } from '@pikku/core/queue'
import type { QueueService } from '@pikku/core/queue'
import { pikkuState } from '@pikku/core/state'
import { BullQueueService, BullQueueWorkers } from '@pikku/queue-bullmq'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'

const USER = 'user-1'
const TRACE = 'a'.repeat(32)
const TRACEPARENT = `00-${TRACE}-${'b'.repeat(16)}-01`
const SECRET = 'queue-identity-verifier-secret-of-enough-length'

type Run = { n: number; user?: string; session?: string; traceId?: string }

const runs: Run[] = []
const failedOnce = new Set<number>()

const logger = {
  info() {},
  warn: console.warn,
  error() {},
  debug() {},
}
const secrets = {
  getSecret: async () => createSecretValue(SECRET),
  hasSecret: async () => true,
}

const wireWorker = (name: string) => {
  const pikkuFuncId = `queue_${name}`
  pikkuState(null, 'queue', 'meta')[name] = {
    pikkuFuncId,
    name,
    schemaName: null,
  } as never
  pikkuState(null, 'function', 'meta')[pikkuFuncId] = {
    pikkuFuncId,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  } as never
  wireQueueWorker({
    name,
    func: {
      auth: false,
      func: async (
        _services: unknown,
        data: { n: number; retry?: boolean },
        wire: any
      ) => {
        runs.push({
          n: data.n,
          user: wire.pikkuUserId,
          session: wire.session?.userId,
          traceId: wire.traceId,
        })
        if (data.retry && !failedOnce.has(data.n)) {
          failedOnce.add(data.n)
          throw new Error('first attempt')
        }
      },
    },
  } as never)
}

const waitForRuns = async (count: number) => {
  const deadline = Date.now() + 15000
  while (runs.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  // A job that ran twice when it should not have shows up in this gap.
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(runs.length, count, JSON.stringify(runs))
}

const verify = async (
  name: string,
  queue: string,
  queueService: QueueService
) => {
  runs.length = 0
  failedOnce.clear()
  const signed = new SignedQueueService(
    queueService,
    secrets as never,
    logger as never
  )

  await signed.add(
    queue,
    { n: 1 },
    {
      pikkuUserId: USER,
      traceparent: TRACEPARENT,
    }
  )
  await signed.add(queue, { n: 2 }, { pikkuUserId: USER })
  await queueService.add(queue, { n: 3 }, { pikkuUserId: USER })
  await queueService.add(queue, { n: 4 }, { pikkuUserId: 'pq1.e30.AAAA' })
  await queueService.add(queue, { n: 5 })
  await signed.add(
    queue,
    { n: 6, retry: true },
    {
      pikkuUserId: USER,
      attempts: 2,
      backoff: { type: 'fixed', delay: 100 },
    }
  )

  await waitForRuns(7)
  const job = (n: number) => runs.filter((run) => run.n === n)

  assert.deepEqual(
    [job(1)[0]?.user, job(1)[0]?.session],
    [USER, USER],
    'a signed job runs as its user'
  )
  assert.equal(job(1)[0]?.traceId, TRACE, 'identity keeps the trace')
  assert.equal(job(2)[0]?.session, USER, 'a signed job needs no trace')
  for (const n of [3, 4, 5]) {
    assert.equal(job(n)[0]?.user, undefined, `job ${n} names no user`)
    assert.equal(job(n)[0]?.session, undefined, `job ${n} has no session`)
  }
  assert.equal(job(6).length, 2, 'the job was retried')
  for (const attempt of job(6)) {
    assert.equal(attempt.session, USER, 'a retry stays the user')
  }
  console.log(`✓ ${name}`)
}

const main = async () => {
  const { REDIS_PORT, DATABASE_URL } = process.env
  assert.ok(REDIS_PORT || DATABASE_URL, 'set REDIS_PORT or DATABASE_URL')

  pikkuState(null, 'package', 'singletonServices', {
    logger,
    secrets,
    sessionStore: {
      get: async (id: string) => (id === USER ? { userId: USER } : undefined),
    },
  } as never)
  wireWorker('identity-bullmq')
  wireWorker('identity-pg-boss')

  if (REDIS_PORT) {
    const connection = { host: '127.0.0.1', port: Number(REDIS_PORT) }
    const workers = new BullQueueWorkers(connection)
    await workers.registerQueues()
    await verify('BullMQ', 'identity-bullmq', new BullQueueService(connection))
    await workers.close()
  }

  if (DATABASE_URL) {
    const factory = new PgBossServiceFactory(DATABASE_URL)
    await factory.init()
    await factory.getQueueWorkers().registerQueues()
    await verify('pg-boss', 'identity-pg-boss', factory.getQueueService())
    await factory.close()
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
