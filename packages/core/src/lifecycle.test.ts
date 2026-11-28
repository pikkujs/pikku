import { describe, test } from 'node:test'
import assert from 'node:assert'
import { onShutdownSignals } from './lifecycle.js'

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
