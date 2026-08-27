import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  DataLock,
  type LockRecord,
  type LockVault,
} from '../../classification/data-lock.js'
import {
  InvalidPassphraseError,
  TooManyAttemptsError,
} from '../../errors/errors.js'
import { wireDataLock } from './data-lock-wiring.js'

class InMemoryLockVault implements LockVault {
  constructor(private records: LockRecord[] = []) {}

  async read(): Promise<LockRecord[]> {
    return this.records
  }

  async write(records: LockRecord[]): Promise<void> {
    this.records = records
  }
}

const PASSPHRASE = 'correct horse battery staple'

const handler = (funcId: string) => {
  const config = pikkuState(null, 'function', 'functions').get(funcId)
  assert.ok(config, `no function registered for ${funcId}`)
  return (data: unknown): Promise<any> =>
    (config.func as any)({} as any, data as any, {} as any)
}

describe('wireDataLock', () => {
  let vault: InMemoryLockVault
  let lock: DataLock

  beforeEach(async () => {
    resetPikkuState()
    vault = new InMemoryLockVault()
    lock = new DataLock(vault)
    await lock.init()
  })

  test('every lock operation gets a route', () => {
    wireDataLock(lock)

    const routes = pikkuState(null, 'http', 'routes')
    assert.ok(routes.get('get')?.has('/_pikku/data/status'))
    assert.ok(routes.get('post')?.has('/_pikku/data/initialize'))
    assert.ok(routes.get('post')?.has('/_pikku/data/unlock'))
    assert.ok(routes.get('post')?.has('/_pikku/data/lock'))
  })

  test('a custom prefix moves every route', () => {
    wireDataLock(lock, { prefix: '/admin/vault' })

    const routes = pikkuState(null, 'http', 'routes')
    assert.ok(routes.get('get')?.has('/admin/vault/status'))
    assert.ok(routes.get('post')?.has('/admin/vault/unlock'))
  })

  test('no lock route asks for a session', () => {
    // The gate cannot sit in front of its own key: a session may itself be
    // stored in an encrypted column, so requiring one would make a locked
    // store impossible to open.
    wireDataLock(lock)

    const routes = pikkuState(null, 'http', 'routes')
    for (const [, byRoute] of routes) {
      for (const [, wiring] of byRoute) {
        assert.equal(wiring.auth, false)
      }
    }
  })

  test('wiring twice leaves one registration', () => {
    wireDataLock(lock)
    wireDataLock(lock)

    const routes = pikkuState(null, 'http', 'routes')
    assert.equal(routes.get('post')?.size, 3)
  })

  test('status reports a store that has never been initialized', async () => {
    wireDataLock(lock)

    assert.deepEqual(await handler('pikkuDataLockStatus')(undefined), {
      state: 'uninitialized',
      retryAfterMs: 0,
    })
  })

  test('initializing opens the store', async () => {
    wireDataLock(lock)

    const result = await handler('pikkuDataLockInitialize')({
      passphrase: PASSPHRASE,
    })

    assert.equal(result.state, 'unlocked')
    assert.equal(lock.state, 'unlocked')
  })

  test('initializing mints every key the wiring was given', async () => {
    // The manifest is the only thing that knows which keys the schema names,
    // and the unlock screen posts a passphrase and nothing else — so the list
    // has to be fixed at wiring time or a scoped key never gets minted at all.
    wireDataLock(lock, { keyIds: ['notes', 'credentials'] })

    await handler('pikkuDataLockInitialize')({ passphrase: PASSPHRASE })

    assert.ok(await lock.getKEK('notes'))
    assert.ok(await lock.getKEK('credentials'))
  })

  test('unlocking opens a store that came up locked', async () => {
    wireDataLock(lock)
    await handler('pikkuDataLockInitialize')({ passphrase: PASSPHRASE })
    lock.lock()

    const result = await handler('pikkuDataLockUnlock')({
      passphrase: PASSPHRASE,
    })

    assert.equal(result.state, 'unlocked')
  })

  test('a wrong passphrase leaves the store locked', async () => {
    wireDataLock(lock)
    await handler('pikkuDataLockInitialize')({ passphrase: PASSPHRASE })
    lock.lock()

    await assert.rejects(
      handler('pikkuDataLockUnlock')({ passphrase: 'hunter2' }),
      InvalidPassphraseError
    )
    assert.equal(lock.state, 'locked')
  })

  test('locking takes the passphrase, so a stranger cannot take the app down', async () => {
    // Without this an unauthenticated POST would be a one-request denial of
    // service against any headless server: the store shuts and stays shut
    // until someone types the passphrase back in.
    wireDataLock(lock)
    await handler('pikkuDataLockInitialize')({ passphrase: PASSPHRASE })

    await assert.rejects(
      handler('pikkuDataLockLock')({ passphrase: 'hunter2' }),
      InvalidPassphraseError
    )
    assert.equal(lock.state, 'unlocked')

    const result = await handler('pikkuDataLockLock')({
      passphrase: PASSPHRASE,
    })
    assert.equal(result.state, 'locked')
  })

  test('status reports how long a lockout still has to run', async () => {
    let now = 0
    const throttled = new DataLock(vault, { now: () => now })
    await throttled.init()
    wireDataLock(throttled)

    await handler('pikkuDataLockInitialize')({ passphrase: PASSPHRASE })
    throttled.lock()
    for (let attempt = 0; attempt < 5; attempt++) {
      await assert.rejects(
        handler('pikkuDataLockUnlock')({ passphrase: 'wrong' }),
        InvalidPassphraseError
      )
    }

    // The unlock screen needs a countdown to show; without it the only way to
    // learn the wait is over is to keep guessing, which extends it.
    const status = await handler('pikkuDataLockStatus')(undefined)
    assert.equal(status.state, 'locked')
    assert.equal(status.retryAfterMs, 30_000)

    await assert.rejects(
      handler('pikkuDataLockUnlock')({ passphrase: PASSPHRASE }),
      TooManyAttemptsError
    )
  })
})
