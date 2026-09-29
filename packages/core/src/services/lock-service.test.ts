import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { holdLock, InMemoryLockService } from './lock-service.js'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const heldBody = () => {
  let release!: () => void
  let entered!: () => void
  const body = new Promise<void>((resolve) => {
    release = resolve
  })
  const bodyEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  return {
    run: () => {
      entered()
      return body
    },
    bodyEntered,
    release,
  }
}

describe('holdLock', () => {
  test('serialises bodies on the same key', async () => {
    const locks = new InMemoryLockService()
    const order: string[] = []
    const hold = (tag: string, ms: number) =>
      holdLock(
        locks,
        'k',
        async () => {
          order.push(`${tag}:in`)
          await wait(ms)
          order.push(`${tag}:out`)
        },
        { pollMs: 5 }
      )

    await Promise.all([hold('a', 30), hold('b', 0)])

    assert.deepEqual(order, ['a:in', 'a:out', 'b:in', 'b:out'])
  })

  test('returns the body value and frees the key', async () => {
    const locks = new InMemoryLockService()
    assert.equal(await holdLock(locks, 'k', async () => 42), 42)
    assert.equal(await locks.get('k'), null)
  })

  test('frees the key when the body throws', async () => {
    const locks = new InMemoryLockService()
    await assert.rejects(
      holdLock(locks, 'k', async () => {
        throw new Error('boom')
      }),
      /boom/
    )
    assert.equal(await locks.get('k'), null)
  })

  test('gives up waiting after waitMs', async () => {
    const locks = new InMemoryLockService()
    const { run, bodyEntered, release } = heldBody()
    const held = holdLock(locks, 'k', run)
    await bodyEntered

    await assert.rejects(
      holdLock(locks, 'k', async () => {}, { waitMs: 50, pollMs: 10 }),
      (err: Error) => err.name === 'LockTimeoutError'
    )

    release()
    await held
  })

  test('takes the lock back from a body that never settles', async () => {
    const locks = new InMemoryLockService()
    await assert.rejects(
      holdLock(locks, 'k', () => new Promise<never>(() => {}), {
        maxHoldMs: 50,
      }),
      (err: Error) => err.name === 'LockHoldTimeoutError'
    )
    assert.equal(await locks.get('k'), null)
  })

  test('keeps the lease alive past its ttl while the body runs', async () => {
    const locks = new InMemoryLockService()
    const { run, bodyEntered, release } = heldBody()
    const held = holdLock(locks, 'k', run, { ttlMs: 60 })
    await bodyEntered
    await wait(200)

    assert.ok(await locks.get('k'), 'the lease lapsed under a running body')
    assert.equal(await locks.acquire('k', 'other', 1_000), null)

    release()
    await held
  })
})
