import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { NatsServiceFactory } from './nats-service-factory.js'
import { NatsSchedulerService } from './nats-scheduler-service.js'

// A recurring fire that is still running when the connection drains cannot
// ack, so the broker redelivers it and the task runs twice.
describe('NatsServiceFactory.close — recurring fires', () => {
  test('waits for the scheduler to drain before the connection does', async () => {
    const order: string[] = []
    const factory: any = new NatsServiceFactory({
      servers: 'nats://unused',
      streamName: 's',
      subjectPrefix: 'p',
    })
    factory.connection = {
      drain: async () => {
        order.push('connection drained')
      },
    }
    factory.schedulerService = {
      drain: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        order.push('fires settled')
        return true
      },
      stop: async () => {
        order.push('scheduler stopped')
      },
    }
    await factory.close()
    assert.deepEqual(order, [
      'fires settled',
      'scheduler stopped',
      'connection drained',
    ])
  })
})

describe('NatsSchedulerService.drain', () => {
  const scheduler = (consumer?: object) => {
    const service: any = new NatsSchedulerService(
      {} as any,
      {} as any,
      's',
      'p'
    )
    service.consumer = consumer
    return service as NatsSchedulerService
  }

  test("reports the consumer's drain result and releases it", async () => {
    let asked: number | undefined
    const service = scheduler({
      drain: async (timeoutMs: number) => {
        asked = timeoutMs
        return false
      },
    })
    assert.equal(await service.drain(5), false)
    assert.equal(asked, 5)
    assert.equal((service as any).consumer, undefined)
  })

  test('has nothing to wait for before start()', async () => {
    assert.equal(await scheduler().drain(5), true)
  })
})
