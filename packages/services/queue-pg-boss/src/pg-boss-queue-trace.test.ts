/**
 * The trace conformance suite against a real Postgres. Skipped unless
 * `PG_BOSS_TEST_URL` is set; `scripts/test-trace-adapters.sh` starts one.
 */
import test from 'node:test'
import { PgBoss } from 'pg-boss'
import { defineQueueTraceConformance } from '@pikku/core/testing'
import { PgBossQueueService } from './pg-boss-queue-service.js'
import { PgBossQueueWorkers } from './pg-boss-queue-worker.js'

const url = process.env.PG_BOSS_TEST_URL

if (!url) {
  test.skip('pg-boss trace conformance needs PG_BOSS_TEST_URL', () => {})
} else {
  defineQueueTraceConformance(
    'pg-boss',
    async () => {
      const boss = new PgBoss(url)
      boss.on('error', () => {})
      await boss.start()
      const service = new PgBossQueueService(boss)
      return {
        service,
        envelope: true,
        startWorkers: async () => {
          await new PgBossQueueWorkers(boss).registerQueues()
        },
        stop: () => boss.stop({ graceful: false }),
        publishRaw: async (queueName, payload) => {
          await boss.createQueue(queueName)
          await boss.send(queueName, payload as object)
        },
      }
    },
    { settleMs: 60_000 }
  )
}
