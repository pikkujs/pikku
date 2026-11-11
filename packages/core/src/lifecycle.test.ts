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

  test('start hooks run first, stop hooks after the app afterStop', async () => {
    const { events, hook, app } = recorder()
    const lifecycle = composeServerLifecycle(app, {
      start: [hook('start:a'), hook('start:b')],
      stop: [hook('stop:b'), hook('stop:a')],
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
      'stop:b',
      'stop:a',
    ])
  })

  test('works without an app lifecycle', async () => {
    const { events, hook } = recorder()
    const lifecycle = composeServerLifecycle(undefined, {
      start: [hook('s')],
      stop: [hook('t')],
    })
    await lifecycle.beforeStart!({} as any)
    await lifecycle.afterStop!({} as any)
    assert.deepStrictEqual(events, ['s', 't'])
  })

  test('a failing start hook aborts startup naming the contributor', async () => {
    const { events, hook, app } = recorder()
    const lifecycle = composeServerLifecycle(app, {
      start: [hook('start:a'), hook('start:b', true), hook('start:c')],
    })
    await assert.rejects(
      lifecycle.beforeStart!({} as any),
      /Contributor 'start:b' failed in onServerStart: start:b broke/
    )
    assert.deepStrictEqual(events, ['start:a', 'start:b'])
  })

  test('every stop hook is attempted when one throws, then all failures are reported', async () => {
    const { events, hook, app } = recorder()
    const lifecycle = composeServerLifecycle(app, {
      stop: [hook('stop:c', true), hook('stop:b'), hook('stop:a', true)],
    })
    await assert.rejects(lifecycle.afterStop!({} as any), (error: any) => {
      assert.match(
        error.message,
        /contributor 'stop:c' onServerStop: stop:c broke/
      )
      assert.match(
        error.message,
        /contributor 'stop:a' onServerStop: stop:a broke/
      )
      assert.strictEqual(error.errors.length, 2)
      return true
    })
    assert.deepStrictEqual(events, [
      'app:afterStop',
      'stop:c',
      'stop:b',
      'stop:a',
    ])
  })

  test('stop hooks still run when the app afterStop throws, which is rethrown as is', async () => {
    const events: string[] = []
    const boom = new Error('app broke')
    const lifecycle = composeServerLifecycle(
      {
        afterStop: async () => {
          throw boom
        },
      },
      { stop: [{ name: 'x', run: async () => void events.push('x') }] }
    )
    await assert.rejects(
      lifecycle.afterStop!({} as any),
      (error) => error === boom
    )
    assert.deepStrictEqual(events, ['x'])
  })
})
