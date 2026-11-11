/**
 * The trace conformance suite against a real JetStream server. Skipped unless
 * `NATS_TEST_URL` is set; `scripts/test-trace-adapters.sh` starts one.
 */
import test from 'node:test'
import { defineQueueTraceConformance } from '@pikku/core/testing'
import { jetstreamManager, RetentionPolicy } from '@nats-io/jetstream'
import { connect } from '@nats-io/transport-node'
import { NatsServiceFactory } from './nats-service-factory.js'
import { natsOptionsFromEnv } from './nats-contributor.js'

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

  // The same suite through the attach path the standalone contributor ships:
  // the options come from natsOptionsFromEnv, and the stage's own stream is
  // created up front by a separate admin connection, as Studio does. The
  // factory must only ever attach to it.
  const project = 'trace'
  const stage = `att${id}`
  const stream = `pikku_${project}_${stage}`
  defineQueueTraceConformance(
    'nats (attach to a per-stage stream)',
    async () => {
      const admin = await connect({ servers })
      const jsm = await jetstreamManager(admin)
      await jsm.streams.add({
        name: stream,
        subjects: [`pikku.${project}.${stage}.>`],
        retention: RetentionPolicy.Workqueue,
        allow_msg_schedules: true,
      })
      const factory = new NatsServiceFactory(
        natsOptionsFromEnv({
          NATS_URL: servers,
          NATS_USER: 'unused',
          NATS_PASSWORD: 'unused',
          PIKKU_PROJECT: project,
          PIKKU_STAGE: stage,
        })
      )
      await factory.init()
      return {
        service: factory.getQueueService(),
        startWorkers: async () => {
          await factory.getQueueWorkers().registerQueues()
        },
        stop: async () => {
          await factory.close()
          await jsm.streams.delete(stream)
          await admin.close()
        },
        publishRaw: async (queueName, payload) => {
          await factory.getQueueService().add(queueName, payload)
        },
      }
    }
  )
}
