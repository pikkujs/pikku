import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { connectNats, nats, natsOptionsFromEnv } from './nats-service.js'

const env = {
  NATS_URL: 'nats://localhost:4222',
  NATS_USER: 'shop-prod',
  NATS_PASSWORD: 'secret',
  PIKKU_PROJECT: 'shop',
  PIKKU_STAGE: 'prod',
}
const without = (name: string) =>
  Object.fromEntries(Object.entries(env).filter(([key]) => key !== name))

const fakeFactory = () => {
  const calls: string[] = []
  const queueService = { kind: 'queue' }
  const schedulerService = { kind: 'scheduler' }
  const factory = {
    init: async () => void calls.push('init'),
    getQueueService: () => queueService as never,
    getSchedulerService: () => schedulerService as never,
    getQueueWorkers: () =>
      ({
        registerQueues: async (logger: unknown) => {
          calls.push(`registerQueues:${logger === 'logger'}`)
          return {}
        },
      }) as never,
    drainWorkers: async (ms: number) => {
      calls.push(`drain:${ms}`)
      return ['slow']
    },
    close: async () => void calls.push('close'),
  }
  return { calls, factory, queueService, schedulerService }
}

describe('nats service registration', () => {
  test('is a deploy-only service: pikku dev never gets it', () => {
    assert.equal(typeof nats.deploy, 'function')
    assert.equal('dev' in nats, false)
    assert.equal('common' in nats, false)
  })

  test('registers the queue workers once the server starts', () => {
    assert.equal(typeof nats.onServerStart, 'function')
  })
})

describe('natsOptionsFromEnv', () => {
  test('names the stream, subjects and inbox after project and stage, and attaches to its own stream', () => {
    const options = natsOptionsFromEnv(env)
    assert.equal(options.streamName, 'pikku_shop_prod')
    assert.equal(options.subjectPrefix, 'pikku.shop.prod')
    assert.equal(options.inboxPrefix, '_INBOX.shop.prod')
    assert.equal(options.attachToStream, true)
    assert.deepEqual(options.servers, ['nats://localhost:4222'])
  })

  test('the stream name is always derived: there is no override', () => {
    assert.equal(
      natsOptionsFromEnv({ ...env, NATS_STREAM: 'OTHER' }).streamName,
      `pikku_${env.PIKKU_PROJECT}_${env.PIKKU_STAGE}`
    )
  })

  test('passes the user and password to the connection', () => {
    const options = natsOptionsFromEnv(env)
    assert.equal(options.user, 'shop-prod')
    assert.equal(options.pass, 'secret')
  })

  for (const name of Object.keys(env)) {
    test(`refuses a missing ${name}, without falling back to the in-memory queue`, () => {
      assert.throws(
        () => natsOptionsFromEnv(without(name)),
        new RegExp(`needs ${name}.*never falls back to the in-memory queue`)
      )
    })
  }

  test('refuses a project or stage that is not one safe subject token', () => {
    for (const name of ['PIKKU_PROJECT', 'PIKKU_STAGE']) {
      for (const bad of [
        'a.b',
        'a b',
        'Shop',
        '-x',
        'x-',
        'a--b',
        'a_b',
        'a>',
        'a*',
        '>',
        'a'.repeat(64),
      ]) {
        assert.throws(
          () => natsOptionsFromEnv({ ...env, [name]: bad }),
          /not usable in a NATS subject/,
          `${name}=${bad}`
        )
      }
    }
  })

  test('project and stage cannot be split differently to name the same stream', () => {
    const one = natsOptionsFromEnv({
      ...env,
      PIKKU_PROJECT: 'a-b',
      PIKKU_STAGE: 'c',
    })
    const two = natsOptionsFromEnv({
      ...env,
      PIKKU_PROJECT: 'a',
      PIKKU_STAGE: 'b-c',
    })
    assert.notEqual(one.streamName, two.streamName)
  })
})

const connect = (fake: ReturnType<typeof fakeFactory>, logger?: unknown) =>
  connectNats(logger as never, env, () => fake.factory)

describe('nats service lifecycle', () => {
  test('connecting initialises, then provides queue, scheduler and the lifecycle', async () => {
    const fake = fakeFactory()
    const provided = await connect(fake)
    assert.deepEqual(fake.calls, ['init'])
    assert.equal(provided.queueService, fake.queueService as never)
    assert.equal(provided.schedulerService, fake.schedulerService as never)
    assert.equal(typeof provided.natsLifecycle.stop, 'function')
  })

  test('the deploy variant builds from the logger and env', async () => {
    await assert.rejects(
      nats.deploy!({ logger: undefined } as never, {}),
      /needs NATS_URL/
    )
  })

  test('fails before connecting when the env is incomplete', async () => {
    const fake = fakeFactory()
    await assert.rejects(
      connectNats(undefined, {}, () => fake.factory),
      /needs NATS_URL/
    )
    assert.deepEqual(fake.calls, [])
  })

  test('onServerStart registers the queue workers with the app logger', async () => {
    const fake = fakeFactory()
    const { natsLifecycle } = await connect(fake)
    fake.calls.length = 0
    await nats.onServerStart!({ natsLifecycle, logger: 'logger' })
    assert.deepEqual(fake.calls, ['registerQueues:true'])
  })

  test('stop drains the workers, warns about stragglers, then closes', async () => {
    const fake = fakeFactory()
    const warnings: string[] = []
    const { natsLifecycle } = await connect(fake, {
      warn: (m: string) => warnings.push(m),
    })
    fake.calls.length = 0
    await natsLifecycle.stop()
    assert.deepEqual(fake.calls, ['drain:10000', 'close'])
    assert.match(warnings[0]!, /slow/)
  })

  test('stop still closes the connection when the drain throws', async () => {
    const fake = fakeFactory()
    fake.factory.drainWorkers = async () => {
      fake.calls.push('drain')
      throw new Error('drain failed')
    }
    const { natsLifecycle } = await connect(fake)
    fake.calls.length = 0
    await assert.rejects(natsLifecycle.stop(), /drain failed/)
    assert.deepEqual(fake.calls, ['drain', 'close'])
  })
})
