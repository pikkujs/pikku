import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  StubTracker,
  stub,
  spy,
  isTestRun,
  getStubTracker,
} from './stub-tracker.js'

describe('StubTracker', () => {
  test('records calls and exposes them via getCalls', () => {
    const tracker = new StubTracker()
    tracker.record('email', 'send', [{ to: 'a@b.c' }])
    tracker.record('payments', 'charge', [{ amount: 5 }])

    assert.equal(tracker.getCalls().length, 2)
    const emailCalls = tracker.getCalls('email')
    assert.equal(emailCalls.length, 1)
    assert.deepEqual(emailCalls[0], {
      service: 'email',
      method: 'send',
      args: [{ to: 'a@b.c' }],
    })
  })

  test('reset clears recorded calls and strict-mode touches', () => {
    const tracker = new StubTracker()
    tracker.record('email', 'send', [])
    tracker.reset()
    assert.equal(tracker.getCalls().length, 0)
    tracker.verify()
  })

  test('legacy stub() proxy records through the same tracker', async () => {
    const tracker = new StubTracker()
    const email = tracker.stub<{ send: (msg: unknown) => Promise<void> }>(
      'email'
    )
    await email.send({ to: 'x@y.z' })
    assert.deepEqual(tracker.getCalls('email')[0]?.args, [{ to: 'x@y.z' }])
    tracker.assert('email', 'send')
  })
})

describe('stub/spy core utils', () => {
  beforeEach(() => getStubTracker().reset())

  test('stub() records into the default tracker and uses the implementation', async () => {
    const email = stub<{ send: (msg: unknown) => Promise<{ ok: boolean }> }>(
      'email',
      { send: async () => ({ ok: true }) }
    )
    const result = await email.send({ to: 'a@b.c' })
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(getStubTracker().getCalls('email')[0], {
      service: 'email',
      method: 'send',
      args: [{ to: 'a@b.c' }],
    })
  })

  test('stub() without an implementation resolves undefined', async () => {
    const payments = stub<{ charge: (x: unknown) => Promise<unknown> }>(
      'payments'
    )
    assert.equal(await payments.charge({ amount: 5 }), undefined)
    assert.equal(getStubTracker().getCalls('payments').length, 1)
  })

  test('spy() records calls and passes through to the real service', async () => {
    let realCalled = 0
    const real = {
      config: { retries: 3 },
      send: async (msg: { to: string }) => {
        realCalled++
        return { delivered: msg.to }
      },
    }
    const email = spy('email', real)

    assert.deepEqual(await email.send({ to: 'a@b.c' }), {
      delivered: 'a@b.c',
    })
    assert.equal(realCalled, 1)
    assert.equal(email.config.retries, 3)
    assert.equal(getStubTracker().getCalls('email').length, 1)
  })
})

describe('isTestRun', () => {
  const original = process.env.PIKKU_TEST_RUN
  afterEach(() => {
    if (original === undefined) delete process.env.PIKKU_TEST_RUN
    else process.env.PIKKU_TEST_RUN = original
  })

  test('reflects the PIKKU_TEST_RUN environment variable', () => {
    delete process.env.PIKKU_TEST_RUN
    assert.equal(isTestRun(), false)
    process.env.PIKKU_TEST_RUN = 'true'
    assert.equal(isTestRun(), true)
  })
})
