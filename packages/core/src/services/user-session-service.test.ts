import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
  createFunctionSessionWireProps,
} from './user-session-service.js'

describe('PikkuSessionService', () => {
  test('should set and get session', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    const session = service.get()
    assert.deepStrictEqual(session, { userId: 'user-1' })
  })

  test('should return undefined when no session set', () => {
    const service = new PikkuSessionService()
    assert.strictEqual(service.get(), undefined)
  })

  test('should mark sessionChanged when set is called', () => {
    const service = new PikkuSessionService()
    assert.strictEqual(service.sessionChanged, false)
    service.set({ userId: 'user-1' })
    assert.strictEqual(service.sessionChanged, true)
  })

  test('should clear session', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    service.clear()
    assert.strictEqual(service.get(), undefined)
    assert.strictEqual(service.sessionChanged, true)
  })

  test('should freeze initial session', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    const frozen = service.freezeInitial()
    assert.deepStrictEqual(frozen, { userId: 'user-1' })
  })

  test('should only freeze initial once', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    service.freezeInitial()
    service.set({ userId: 'user-2' })
    const frozen2 = service.freezeInitial()
    assert.deepStrictEqual(frozen2, { userId: 'user-1' })
  })

  test('should throw when channelStore provided without channelId', () => {
    assert.throws(() => new PikkuSessionService({} as any), {
      message: 'Channel ID is required when using channel store',
    })
  })

  test('should use channelStore when provided', async () => {
    let storedSession: any
    const store = {
      setUserSession: (id: string, session: any) => {
        storedSession = session
      },
      getChannelAndSession: (id: string) => ({ session: { userId: 'stored' } }),
    }
    const service = new PikkuSessionService(store as any, 'ch-1')
    service.set({ userId: 'new' })
    assert.deepStrictEqual(storedSession, { userId: 'new' })

    const session = service.get()
    assert.deepStrictEqual(session, { userId: 'stored' })
  })
})

describe('createMiddlewareSessionWireProps', () => {
  test('should return session wire props', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    const props = createMiddlewareSessionWireProps(service)
    assert.ok('session' in props)
    assert.ok('setSession' in props)
    assert.ok('getSession' in props)
    assert.ok('hasSessionChanged' in props)
  })

  test('setSession should call setInitial', () => {
    const service = new PikkuSessionService()
    const props = createMiddlewareSessionWireProps(service)
    props.setSession({ userId: 'user-2' })
    assert.deepStrictEqual(service.get(), { userId: 'user-2' })
  })
})

describe('createFunctionSessionWireProps', () => {
  test('should return function session wire props', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    const props = createFunctionSessionWireProps(service)
    assert.ok('session' in props)
    assert.ok('setSession' in props)
    assert.ok('clearSession' in props)
    assert.ok('getSession' in props)
    assert.ok('hasSessionChanged' in props)
  })

  test('session should be frozen initial', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    const props = createFunctionSessionWireProps(service)
    assert.deepStrictEqual(props.session, { userId: 'user-1' })
  })
})
