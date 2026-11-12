import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { createNatsDeploy, natsOptionsFromEnv } from './nats-contributor.js'
import { contributors } from './contributors.js'

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

describe('nats contributor registration', () => {
  test('is registered as a deploy-only contributor named nats', () => {
    assert.deepEqual(Object.keys(contributors), ['nats'])
    assert.equal(contributors.nats.deploy.run.length > 0, true)
    assert.equal('dev' in contributors.nats, false)
  })

  test('is selected only for a standalone deploy that uses the queue', () => {
    const nats = createNatsDeploy()
    const platform = (needsQueue: boolean, provider?: string) =>
      ({ serviceNames: [], needsQueue, provider }) as never
    assert.equal(nats.when!(platform(true, 'standalone')), true)
    assert.equal(nats.when!(platform(false, 'standalone')), false)
  })

  test('is not selected for another provider, or when the provider is unknown', () => {
    const nats = createNatsDeploy()
    for (const provider of ['cloudflare', 'aws', 'azure', '', undefined]) {
      assert.equal(
        nats.when!({ serviceNames: [], needsQueue: true, provider } as never),
        false,
        String(provider)
      )
    }
  })

  test('replaces the baseline queue and scheduler and exposes the factory', () => {
    assert.deepEqual(createNatsDeploy().provides, [
      'queueService',
      'schedulerService',
      'natsLifecycle',
    ])
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

type Lifecycle = {
  registerQueues(logger: unknown): Promise<unknown>
  drainWorkers(timeoutMs: number): Promise<string[]>
  close(): Promise<void>
}
type Services = {
  queueService?: unknown
  schedulerService?: unknown
  natsLifecycle?: Lifecycle
}

const lifecycleOf = async (fake: ReturnType<typeof fakeFactory>) => {
  const services: Services = {}
  await createNatsDeploy(() => fake.factory).run(services, env, {}, {} as never)
  fake.calls.length = 0
  return services.natsLifecycle as Lifecycle
}

describe('nats contributor lifecycle', () => {
  test('run connects, then provides queue, scheduler and the factory', async () => {
    const fake = fakeFactory()
    const services: Services = {}
    await createNatsDeploy(() => fake.factory).run(
      services,
      env,
      {},
      {} as never
    )
    assert.deepEqual(fake.calls, ['init'])
    assert.equal(services.queueService, fake.queueService)
    assert.equal(services.schedulerService, fake.schedulerService)
    // The server stops every singleton service that has stop(); this one must
    // not, or the workers close before onServerStop can drain them.
    assert.equal('stop' in services.natsLifecycle!, false)
    assert.equal(services.natsLifecycle!.drainWorkers.length, 1)
  })

  test('run fails before connecting when the env is incomplete', async () => {
    const fake = fakeFactory()
    await assert.rejects(
      createNatsDeploy(() => fake.factory).run({}, {}, {}, {} as never),
      /needs NATS_URL/
    )
    assert.deepEqual(fake.calls, [])
  })

  test('onServerStart registers the queue workers with the app logger', async () => {
    const fake = fakeFactory()
    await createNatsDeploy(() => fake.factory).onServerStart!({
      natsLifecycle: await lifecycleOf(fake),
      logger: 'logger',
    })
    assert.deepEqual(fake.calls, ['registerQueues:true'])
  })

  test('onServerStop drains the workers, warns about stragglers, then closes', async () => {
    const fake = fakeFactory()
    const warnings: string[] = []
    await createNatsDeploy(() => fake.factory).onServerStop!({
      natsLifecycle: await lifecycleOf(fake),
      logger: { warn: (m: string) => warnings.push(m) },
    })
    assert.deepEqual(fake.calls, ['drain:10000', 'close'])
    assert.match(warnings[0]!, /slow/)
  })

  test('onServerStop still closes the connection when the drain throws', async () => {
    const fake = fakeFactory()
    fake.factory.drainWorkers = async () => {
      fake.calls.push('drain')
      throw new Error('drain failed')
    }
    await assert.rejects(
      createNatsDeploy(() => fake.factory).onServerStop!({
        natsLifecycle: await lifecycleOf(fake),
        logger: { warn: () => {} },
      }),
      /drain failed/
    )
    assert.deepEqual(fake.calls, ['drain', 'close'])
  })
})
