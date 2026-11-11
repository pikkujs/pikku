/**
 * The trace conformance suite against a real Redis. Skipped unless
 * `REDIS_TEST_URL` is set; `scripts/test-trace-adapters.sh` starts one.
 */
import test from 'node:test'
import { Queue } from 'bullmq'
import { defineQueueTraceConformance } from '@pikku/core/testing'
import { BullQueueService } from './bull-queue-service.js'
import { BullQueueWorkers } from './bull-queue-worker.js'

const url = process.env.REDIS_TEST_URL

if (!url) {
  test.skip('bullmq trace conformance needs REDIS_TEST_URL', () => {})
} else {
  const { hostname, port } = new URL(url)
  const connection = {
    host: hostname,
    port: Number(port),
    maxRetriesPerRequest: null,
  }
  /**
   * `add` drops the service's connection options, so it always reaches
   * localhost:6379 (bull-queue-service.ts:130). Handed over here until that is
   * fixed, so this suite can run on a port of its own.
   */
  class ConnectedBullQueueService extends BullQueueService {
    protected override createQueue(queueName: string) {
      return super.createQueue(queueName, { connection })
    }
  }

  defineQueueTraceConformance('bullmq', async () => {
    const service = new ConnectedBullQueueService(connection)
    const workers = new BullQueueWorkers(connection)
    const raw: Queue[] = []
    return {
      service,
      envelope: true,
      startWorkers: async () => {
        await workers.registerQueues()
      },
      stop: async () => {
        await workers.close()
        await Promise.all(raw.map((queue) => queue.close()))
      },
      publishRaw: async (queueName, payload) => {
        const queue = new Queue(queueName, { connection })
        raw.push(queue)
        await queue.add(queueName, payload)
      },
    }
  })
}
