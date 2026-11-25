import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  composeServerLifecycle,
  onShutdownSignals,
  stopSingletonServices,
} from './lifecycle.js'
import { pikkuState } from './pikku-state.js'
import { recordStopOrder } from './provider/index.js'

describe('onShutdownSignals', () => {
  test('runs once however many signals arrive while stopping', async () => {
    const events: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const dispose = onShutdownSignals(async (signal) => {
      events.push(`start:${signal}`)
      await gate
      events.push('done')
    })
    try {
      process.emit('SIGTERM')
      process.emit('SIGTERM')
      process.emit('SIGINT')
      await new Promise((resolve) => setImmediate(resolve))
      assert.deepStrictEqual(events, ['start:SIGTERM'])
      release()
      await new Promise((resolve) => setImmediate(resolve))
      assert.deepStrictEqual(events, ['start:SIGTERM', 'done'])
    } finally {
      dispose()
    }
    assert.strictEqual(process.listenerCount('SIGTERM'), 0)
  })
})

describe('composeServerLifecycle', () => {
  const recorder = () => {
    const events: string[] = []
    const hook = (name: string, fail = false) => ({
      name,
      run: async () => {
        events.push(name)
        if (fail) throw new Error(`${name} broke`)
      },
    })
    const app = {
      beforeStart: async () => void events.push('app:beforeStart'),
      afterStart: async () => void events.push('app:afterStart'),
      beforeStop: async () => void events.push('app:beforeStop'),
      afterStop: async () => void events.push('app:afterStop'),
    }
    return { events, hook, app }
  }

  test('start hooks run first, the rest of the app lifecycle is unchanged', async () => {
    const { events, hook, app } = recorder()
    const lifecycle = composeServerLifecycle(app, {
      start: [hook('start:a'), hook('start:b')],
    })
    const services = {} as any
    await lifecycle.beforeStart!(services)
    await lifecycle.afterStart!(services)
    await lifecycle.beforeStop!(services)
    await lifecycle.afterStop!(services)
    assert.deepStrictEqual(events, [
      'start:a',
      'start:b',
      'app:beforeStart',
      'app:afterStart',
      'app:beforeStop',
      'app:afterStop',
    ])
  })

  test('works without an app lifecycle', async () => {
    const { events, hook } = recorder()
    const lifecycle = composeServerLifecycle(undefined, {
      start: [hook('s')],
    })
    await lifecycle.beforeStart!({} as any)
    await lifecycle.afterStop!({} as any)
    assert.deepStrictEqual(events, ['s'])
  })

  test('a failing start hook aborts startup naming the service', async () => {
    const { events, hook, app } = recorder()
    const lifecycle = composeServerLifecycle(app, {
      start: [hook('start:a'), hook('start:b', true), hook('start:c')],
    })
    await assert.rejects(
      lifecycle.beforeStart!({} as any),
      /Provider 'start:b' failed in onServerStart: start:b broke/
    )
    assert.deepStrictEqual(events, ['start:a', 'start:b'])
  })
})

describe('stopSingletonServices', () => {
  const stopping = (log: string[], name: string) => ({
    stop: async () => {
      log.push(name)
    },
  })
  const withServices = async (
    services: Record<string | symbol, unknown>,
    run: () => Promise<void>
  ) => {
    const previous = pikkuState(null, 'package', 'singletonServices')
    const previousOrder = pikkuState(null, 'package', 'providerStopOrder')
    const previousHeld = pikkuState(null, 'package', 'providerHeldKeys')
    pikkuState(null, 'package', 'singletonServices', {
      logger: { info() {}, error() {}, warn() {}, debug() {} },
      ...services,
    } as any)
    try {
      await run()
    } finally {
      pikkuState(null, 'package', 'singletonServices', previous as any)
      pikkuState(null, 'package', 'providerStopOrder', previousOrder)
      pikkuState(null, 'package', 'providerHeldKeys', previousHeld)
    }
  }

  test('without a recorded order, stops in reverse insertion order', async () => {
    const log: string[] = []
    await withServices({ a: stopping(log, 'a'), b: stopping(log, 'b') }, () =>
      stopSingletonServices()
    )
    assert.deepStrictEqual(log, ['b', 'a'])
  })

  test('follows the recorded order, so a replaced baseline key stops with its provider', async () => {
    const log: string[] = []
    const services: Record<string | symbol, unknown> = {
      queueService: stopping(log, 'queueService'),
      db: stopping(log, 'db'),
      cache: stopping(log, 'cache'),
    }
    recordStopOrder(['queueService', 'cache'])
    await withServices(services, () => stopSingletonServices())
    assert.deepStrictEqual(log, ['queueService', 'cache', 'db'])
  })

  test('a service the project built on a provider key stops before the provider keys', async () => {
    const log: string[] = []
    const services: Record<string | symbol, unknown> = {
      queueService: stopping(log, 'queueService'),
      db: stopping(log, 'db'),
      jobs: stopping(log, 'jobs'),
      mailer: stopping(log, 'mailer'),
    }
    recordStopOrder(['queueService'], ['queueService', 'db'])
    await withServices(services, () => stopSingletonServices())
    assert.deepStrictEqual(log, ['mailer', 'jobs', 'queueService', 'db'])
  })

  test('an object held under two keys is stopped once', async () => {
    const log: string[] = []
    const shared = stopping(log, 'shared')
    const services: Record<string | symbol, unknown> = {
      queueService: shared,
      schedulerService: shared,
    }
    recordStopOrder(['schedulerService', 'queueService'])
    await withServices(services, () => stopSingletonServices())
    assert.deepStrictEqual(log, ['shared'])
  })

  test('collection items stop in the recorded order, each item once, a throwing item does not stop the rest', async () => {
    const log: string[] = []
    const failing = {
      async stop() {
        log.push('b')
        throw new Error('stop failed')
      },
    }
    const services: Record<string | symbol, unknown> = {
      db: stopping(log, 'db'),
      things: [
        { label: 'a', item: stopping(log, 'a') },
        { label: 'b', item: failing },
      ],
    }
    recordStopOrder([
      { collection: 'things', label: 'b' },
      { collection: 'things', label: 'a' },
      'db',
    ])
    await withServices(services, () => stopSingletonServices())
    assert.deepStrictEqual(log, ['b', 'a', 'db'])
  })
})
