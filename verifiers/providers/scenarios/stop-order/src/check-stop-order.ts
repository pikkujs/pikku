import assert from 'node:assert/strict'
import {
  ProviderRegistry,
  recordStopOrder,
  runProviders,
} from '@pikku/core/provider'
import { pikkuState } from '@pikku/core/state'
import { stopSingletonServices } from '@pikku/core/lifecycle'

const meta = (needs: string[], provides: string[]) => ({
  needs,
  optional: [],
  provides,
  optionalProvides: [],
})

const log: string[] = []
const stoppable = (name: string) => ({
  stop: async () => {
    log.push(name)
  },
})
const quiet = { info() {}, warn() {}, error() {}, debug() {} }

const shut = async (services: Record<string, unknown>, order: string[]) => {
  log.length = 0
  recordStopOrder(order)
  pikkuState(null, 'package', 'singletonServices', services as never)
  await stopSingletonServices()
  return [...log]
}

// providers a -> b -> c stop c, b, a, whatever order the baseline held keys in
{
  const registry = new ProviderRegistry()
    .add('c', (() => ({ c: stoppable('c') })) as never, {
      common: meta(['b'], ['c']),
    })
    .add('a', (() => ({ a: stoppable('a') })) as never, {
      common: meta([], ['a']),
    })
    .add('b', (() => ({ b: stoppable('b') })) as never, {
      common: meta(['a'], ['b']),
    })
  const services: Record<string, unknown> = { logger: quiet }
  const { stopOrder } = await runProviders(registry, {
    target: 'dev',
    services,
  })
  assert.deepEqual(stopOrder, ['c', 'b', 'a'])
  assert.deepEqual(await shut(services, stopOrder), ['c', 'b', 'a'])
}

// a provider replacing a baseline key stops by provider order, before what it needs
{
  const registry = new ProviderRegistry()
    .add('db', (() => ({ db: stoppable('db') })) as never, {
      common: meta([], ['db']),
    })
    .add(
      'queue',
      (() => ({ queueService: stoppable('queueService') })) as never,
      { common: meta(['db'], ['queueService']) }
    )
  const services: Record<string, unknown> = {
    queueService: stoppable('baselineQueue'),
    logger: quiet,
  }
  const { stopOrder } = await runProviders(registry, {
    target: 'dev',
    services,
  })
  assert.deepEqual(await shut(services, stopOrder), ['queueService', 'db'])
}

// one object under two keys stops once
{
  const shared = stoppable('nats')
  const registry = new ProviderRegistry().add(
    'nats',
    (() => ({ queueService: shared, schedulerService: shared })) as never,
    { common: meta([], ['queueService', 'schedulerService']) }
  )
  const services: Record<string, unknown> = { logger: quiet }
  const { stopOrder } = await runProviders(registry, {
    target: 'dev',
    services,
  })
  assert.deepEqual(await shut(services, stopOrder), ['nats'])
}

console.log(
  'ok: providers stop latest first, a replaced key follows its provider, a shared object stops once'
)
