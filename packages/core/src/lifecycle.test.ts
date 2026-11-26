import { describe, test } from 'node:test'
import assert from 'node:assert'
import { composeServerLifecycle, onShutdownSignals } from './lifecycle.js'

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
      /Service 'start:b' failed in onServerStart: start:b broke/
    )
    assert.deepStrictEqual(events, ['start:a', 'start:b'])
  })
})
