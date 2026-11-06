/**
 * The trace conformance suite against a real JetStream server. Skipped unless
 * `NATS_TEST_URL` is set; `scripts/test-trace-adapters.sh` starts one.
 */
import test from 'node:test'
import { defineQueueTraceConformance } from '@pikku/core/testing'
import { NatsServiceFactory } from './nats-service-factory.js'

const servers = process.env.NATS_TEST_URL

if (!servers) {
  test.skip('nats trace conformance needs NATS_TEST_URL', () => {})
} else {
  const id = Math.random().toString(16).slice(2, 10)
  defineQueueTraceConformance('nats', async () => {
    const factory = new NatsServiceFactory({
      servers,
      streamName: `trace_${id}`,
      subjectPrefix: `trace_${id}`,
    })
    await factory.init()
    return {
      service: factory.getQueueService(),
      startWorkers: async () => {
        await factory.getQueueWorkers().registerQueues()
      },
      stop: async () => {
        await factory.close()
      },
      publishRaw: async (queueName, payload) => {
        await factory.getQueueService().add(queueName, payload)
      },
    }
  })
}
