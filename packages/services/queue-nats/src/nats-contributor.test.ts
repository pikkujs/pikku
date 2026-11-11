import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { createNatsDeploy, natsOptionsFromEnv } from './nats-contributor.js'
import { contributors } from './contributors.js'

const env = { NATS_URL: 'nats://localhost:4222', PIKKU_APP_SLUG: 'shop' }

const fakeFactory = () => {
  const calls: string[] = []
  const queueService = { kind: 'queue' }
  const schedulerService = { kind: 'scheduler' }
  const factory = {
    init: async () => void calls.push('init'),
    getQueueService: () => queueService as any,
    getSchedulerService: () => schedulerService as any,
    getQueueWorkers: () =>
      ({
        registerQueues: async (logger: unknown) => {
          calls.push(`registerQueues:${logger === 'logger'}`)
          return {}
        },
      }) as any,
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

  test('is selected only when the app uses the queue', () => {
    const nats = createNatsDeploy()
    const platform = (needsQueue: boolean) =>
      ({ serviceNames: [], needsQueue }) as any
    assert.equal(nats.when!(platform(true)), true)
    assert.equal(nats.when!(platform(false)), false)
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
  test('derives stream and prefix from the app slug alone', () => {
    const options = natsOptionsFromEnv(env)
    assert.equal(options.streamName, 'pikku-shop')
    assert.equal(options.subjectPrefix, 'pikku.shop')
    assert.deepEqual(options.servers, ['nats://localhost:4222'])
  })

  test('the same slug gives the same names whatever else changes', () => {
    assert.deepEqual(
      natsOptionsFromEnv({ ...env, NATS_TOKEN: 'a' }).streamName,
      natsOptionsFromEnv({ ...env, NATS_TOKEN: 'b' }).streamName
    )
  })

  test('refuses a missing NATS_URL', () => {
    assert.throws(
      () => natsOptionsFromEnv({ PIKKU_APP_SLUG: 'shop' }),
      /needs NATS_URL.*never falls back to the in-memory queue/
    )
  })

  test('refuses a missing PIKKU_APP_SLUG', () => {
    assert.throws(
      () => natsOptionsFromEnv({ NATS_URL: env.NATS_URL }),
      /needs PIKKU_APP_SLUG/
    )
  })

  test('refuses a slug that cannot be a stream name or subject token', () => {
    for (const bad of ['a.b', 'a b', 'Shop', '-x', 'a>', 'a*']) {
      assert.throws(
        () => natsOptionsFromEnv({ ...env, PIKKU_APP_SLUG: bad }),
        /not usable in a NATS stream name/,
        bad
      )
    }
  })

  test('passes credentials through when set', () => {
    const options = natsOptionsFromEnv({
      ...env,
      NATS_USER: 'u',
      NATS_PASSWORD: 'p',
    })
    assert.equal(options.user, 'u')
    assert.equal(options.pass, 'p')
  })
})

const lifecycleOf = async (fake: ReturnType<typeof fakeFactory>) => {
  const services: Record<string, any> = {}
  await createNatsDeploy(() => fake.factory).run(services, env, {}, {} as any)
  fake.calls.length = 0
  return services.natsLifecycle
}

describe('nats contributor lifecycle', () => {
  test('run connects, then provides queue, scheduler and the factory', async () => {
    const fake = fakeFactory()
    const services: Record<string, any> = {}
    await createNatsDeploy(() => fake.factory).run(services, env, {}, {} as any)
    assert.deepEqual(fake.calls, ['init'])
    assert.equal(services.queueService, fake.queueService)
    assert.equal(services.schedulerService, fake.schedulerService)
    // The server stops every singleton service that has stop(); this one must
    // not, or the workers close before onServerStop can drain them.
    assert.equal('stop' in services.natsLifecycle, false)
    assert.equal(services.natsLifecycle.drainWorkers.length, 1)
  })

  test('run fails before connecting when the env is incomplete', async () => {
    const fake = fakeFactory()
    await assert.rejects(
      createNatsDeploy(() => fake.factory).run({}, {}, {}, {} as any),
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
})
