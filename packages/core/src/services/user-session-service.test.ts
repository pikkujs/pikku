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

  test('should mark sessionChanged when set is called', async () => {
    const service = new PikkuSessionService()
    assert.strictEqual(service.sessionChanged, false)
    await service.set({ userId: 'user-1' })
    assert.strictEqual(service.sessionChanged, true)
  })

  test('should clear session', async () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    await service.clear()
    assert.strictEqual(service.get(), undefined)
    assert.strictEqual(service.sessionChanged, true)
  })

  test('should freeze initial session', () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    const frozen = service.freezeInitial()
    assert.deepStrictEqual(frozen, { userId: 'user-1' })
  })

  test('should only freeze initial once', async () => {
    const service = new PikkuSessionService()
    service.setInitial({ userId: 'user-1' })
    service.freezeInitial()
    await service.set({ userId: 'user-2' })
    const frozen2 = service.freezeInitial()
    assert.deepStrictEqual(frozen2, { userId: 'user-1' })
  })

  test('should persist to sessionStore on set when pikkuUserId is set', async () => {
    let storedId: string | undefined
    let storedSession: any
    const store = {
      get: async () => undefined,
      set: async (id: string, session: any) => {
        storedId = id
        storedSession = session
      },
      clear: async () => {},
    }
    const service = new PikkuSessionService(store as any)
    service.setPikkuUserId('user-123')
    await service.set({ userId: 'new' })
    assert.strictEqual(storedId, 'user-123')
    assert.deepStrictEqual(storedSession, { userId: 'new' })
  })

  test('should persist under the session userId when no pikkuUserId is set', async () => {
    let storedId: string | undefined
    const store = {
      get: async () => undefined,
      set: async (id: string) => {
        storedId = id
      },
      clear: async () => {},
    }
    const service = new PikkuSessionService(store as any)
    await service.set({ userId: 'new' })
    assert.strictEqual(storedId, 'new')
    assert.strictEqual(service.getPikkuUserId(), 'new')
  })

  test('should not persist a session that names no user when no pikkuUserId is set', async () => {
    let setCalled = false
    const store = {
      get: async () => undefined,
      set: async () => {
        setCalled = true
      },
      clear: async () => {},
    }
    const service = new PikkuSessionService(store as any)
    await service.set({ scopes: ['a'] } as any)
    assert.strictEqual(setCalled, false)
  })

  test('should clear from sessionStore when pikkuUserId is set', async () => {
    let clearedId: string | undefined
    const store = {
      get: async () => undefined,
      set: async () => {},
      clear: async (id: string) => {
        clearedId = id
      },
    }
    const service = new PikkuSessionService(store as any)
    service.setPikkuUserId('user-123')
    service.setInitial({ userId: 'user-123' })
    await service.clear()
    assert.strictEqual(clearedId, 'user-123')
    assert.strictEqual(service.get(), undefined)
  })

  test('getPikkuUserId should return set value', () => {
    const service = new PikkuSessionService()
    assert.strictEqual(service.getPikkuUserId(), undefined)
    service.setPikkuUserId('user-456')
    assert.strictEqual(service.getPikkuUserId(), 'user-456')
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

  test('setSession marks the session changed and persists, as in a function body', async () => {
    const stored: Array<[string, unknown]> = []
    const store = {
      get: async () => undefined,
      set: async (id: string, session: unknown) => {
        stored.push([id, session])
      },
      clear: async () => {},
    }
    const service = new PikkuSessionService(store as any)
    const props = createMiddlewareSessionWireProps(service)
    await props.setSession({ userId: 'user-2' })
    assert.deepStrictEqual(service.get(), { userId: 'user-2' })
    assert.strictEqual(props.hasSessionChanged(), true)
    assert.deepStrictEqual(stored, [['user-2', { userId: 'user-2' }]])
  })

  test('setInitialSession sets the session without marking it changed or persisting', () => {
    let setCalled = false
    const store = {
      get: async () => undefined,
      set: async () => {
        setCalled = true
      },
      clear: async () => {},
    }
    const service = new PikkuSessionService(store as any)
    const props = createMiddlewareSessionWireProps(service)
    props.setInitialSession({ userId: 'user-2' })
    assert.deepStrictEqual(service.get(), { userId: 'user-2' })
    assert.strictEqual(props.hasSessionChanged(), false)
    assert.strictEqual(setCalled, false)
  })

  test('middleware and function props bind the same session setters', () => {
    const service = new PikkuSessionService()
    const middleware = createMiddlewareSessionWireProps(service)
    const fn = createFunctionSessionWireProps(service)
    const { session: _m, ...middlewareSetters } = middleware
    const { session: _f, ...functionSetters } = fn
    assert.deepStrictEqual(
      Object.keys(middlewareSetters).sort(),
      Object.keys(functionSetters).sort()
    )
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
