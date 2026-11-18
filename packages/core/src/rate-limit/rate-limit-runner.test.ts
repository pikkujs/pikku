import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  MissingServiceError,
  ServiceUnavailableError,
  TooManyRequestsError,
} from '../errors/errors.js'
import { addFunction, runPikkuFunc } from '../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../pikku-state.js'
import { fetchData, wireHTTP } from '../wirings/http/http-runner.js'
import { httpRouter } from '../wirings/http/routers/http-router.js'
import {
  PikkuMockRequest,
  PikkuMockResponse,
} from '../wirings/channel/local/local-channel-runner.test.js'
import { InMemoryRateLimitService } from '../services/in-memory-rate-limit-service.js'
import type { RateLimitService } from '../services/rate-limit-service.js'
import { addGlobalRateLimiter, enforceRateLimit } from './rate-limit-runner.js'
import type { RateLimitCheck } from './rate-limit-runner.js'
import type { RateLimitConfig } from './rate-limit.types.js'

const warnings: string[] = []
const logger = {
  info: () => {},
  debug: () => {},
  warn: (message: string) => warnings.push(message),
  error: () => {},
}

const services = (rateLimitService?: RateLimitService) =>
  ({
    logger,
    rateLimitService,
  }) as unknown as RateLimitCheck['singletonServices']

const check = (
  rateLimitService: RateLimitService | undefined,
  extra: Partial<RateLimitCheck> = {}
): RateLimitCheck => ({
  wire: 'http',
  scope: 'post:/contact',
  singletonServices: services(rateLimitService),
  ...extra,
})

const LIMIT_TWO: RateLimitConfig = { limit: 2, windowMs: 60_000 }

describe('enforceRateLimit', () => {
  beforeEach(() => {
    resetPikkuState()
    warnings.length = 0
  })

  test('counts nothing when no limit is set', async () => {
    const limiter = new InMemoryRateLimitService()
    for (let i = 0; i < 5; i++) await enforceRateLimit(check(limiter))
  })

  test('admits the limit, then refuses with a 429 carrying retryAfterMs', async () => {
    addGlobalRateLimiter(LIMIT_TWO)
    const limiter = new InMemoryRateLimitService()
    await enforceRateLimit(check(limiter))
    await enforceRateLimit(check(limiter))
    await assert.rejects(enforceRateLimit(check(limiter)), (e: any) => {
      assert.ok(e instanceof TooManyRequestsError)
      assert.ok(e.payload.retryAfterMs > 0)
      return true
    })
  })

  test('sets Retry-After in whole seconds, rounded up', async () => {
    addGlobalRateLimiter({ limit: 1, windowMs: 1_500 })
    const limiter = new InMemoryRateLimitService()
    const seen: number[] = []
    const withHeader = () =>
      check(limiter, { setRetryAfter: (seconds) => seen.push(seconds) })
    await enforceRateLimit(withHeader())
    await assert.rejects(enforceRateLimit(withHeader()), TooManyRequestsError)
    assert.deepEqual(seen, [2])
  })

  test("a function's own limit replaces the global one", async () => {
    addGlobalRateLimiter({ limit: 1, windowMs: 60_000 })
    const limiter = new InMemoryRateLimitService()
    const override = { override: { limit: 3, windowMs: 60_000 } }
    for (let i = 0; i < 3; i++) await enforceRateLimit(check(limiter, override))
    await assert.rejects(
      enforceRateLimit(check(limiter, override)),
      TooManyRequestsError
    )
  })

  test('`false` exempts a function from the global limit', async () => {
    addGlobalRateLimiter({ limit: 1, windowMs: 60_000 })
    const limiter = new InMemoryRateLimitService()
    for (let i = 0; i < 5; i++) {
      await enforceRateLimit(check(limiter, { override: false }))
    }
  })

  test('callers are counted apart by the configured header, first hop only', async () => {
    addGlobalRateLimiter({
      ...LIMIT_TWO,
      limit: 1,
      ipHeader: 'x-forwarded-for',
    })
    const limiter = new InMemoryRateLimitService()
    const from = (value: string) => check(limiter, { header: () => value })
    await enforceRateLimit(from('1.1.1.1, 10.0.0.1'))
    await enforceRateLimit(from('2.2.2.2, 10.0.0.1'))
    await assert.rejects(
      enforceRateLimit(from('1.1.1.1, 10.9.9.9')),
      TooManyRequestsError
    )
  })

  test('without an ipHeader everyone shares one bucket, and it says so once', async () => {
    addGlobalRateLimiter({ ...LIMIT_TWO, limit: 1 })
    const limiter = new InMemoryRateLimitService()
    await enforceRateLimit(check(limiter, { header: () => '1.1.1.1' }))
    await assert.rejects(
      enforceRateLimit(check(limiter, { header: () => '2.2.2.2' })),
      TooManyRequestsError
    )
    assert.equal(warnings.filter((w) => w.includes('`ipHeader`')).length, 1)
  })

  test('scopes and wires are counted apart', async () => {
    addGlobalRateLimiter({ ...LIMIT_TWO, limit: 1 })
    const limiter = new InMemoryRateLimitService()
    await enforceRateLimit(check(limiter, { scope: 'post:/a' }))
    await enforceRateLimit(check(limiter, { scope: 'post:/b' }))
    await enforceRateLimit(check(limiter, { scope: 'post:/a', wire: 'mcp' }))
  })

  test('a limit with no rateLimitService is refused, never ignored', async () => {
    addGlobalRateLimiter(LIMIT_TWO)
    await assert.rejects(
      enforceRateLimit(check(undefined)),
      MissingServiceError
    )
  })

  const failing: RateLimitService = {
    hit: async () => {
      throw new Error('store down')
    },
  }

  test('a failing store answers 503 by default', async () => {
    addGlobalRateLimiter(LIMIT_TWO)
    await assert.rejects(
      enforceRateLimit(check(failing)),
      ServiceUnavailableError
    )
  })

  test("a failing store lets calls through when the limit says `onStoreError: 'allow'`", async () => {
    addGlobalRateLimiter({ ...LIMIT_TWO, onStoreError: 'allow' })
    await enforceRateLimit(check(failing))
  })

  test('a correct and an incorrect call are refused the same way', async () => {
    addGlobalRateLimiter({ ...LIMIT_TWO, limit: 1 })
    const limiter = new InMemoryRateLimitService()
    await enforceRateLimit(check(limiter))
    const refusals: unknown[] = []
    for (const scopeCall of [check(limiter), check(limiter)]) {
      await enforceRateLimit(scopeCall).catch((e) => refusals.push(e.payload))
    }
    assert.equal(refusals.length, 2)
    assert.deepEqual(Object.keys(refusals[0] as object), ['retryAfterMs'])
  })
})

class TestResponse extends PikkuMockResponse {
  headersMap = new Map<string, string | string[]>()
  header(name: string, value: string | string[]): this {
    this.headersMap.set(name, value)
    return this
  }
}

class TestRequest extends PikkuMockRequest {
  constructor(
    path: string,
    method: 'get' | 'post',
    private headerValues: Record<string, string> = {}
  ) {
    super(path, method)
  }
  header(name: string): string | null {
    return this.headerValues[name] ?? null
  }
  async data() {
    return {}
  }
}

const wireRoute = (funcConfig: Record<string, unknown> = {}) => {
  pikkuState(null, 'function', 'meta', {
    pikku_func_name: {
      pikkuFuncId: 'pikku_func_name',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
      services: ['userSession'],
    },
  } as any)
  pikkuState(null, 'http', 'meta', {
    get: {
      test: { pikkuFuncId: 'pikku_func_name', route: 'test', method: 'get' },
    },
    post: {},
    delete: {},
    patch: {},
    head: {},
    put: {},
    options: {},
  } as any)
  let calls = 0
  const func = async () => ({ ok: ++calls })
  const config = { func, ...funcConfig } as any
  addFunction('pikku_func_name', config)
  wireHTTP({ route: 'test', method: 'get', func: config, auth: false })
}

describe('rate limits on external calls', () => {
  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
    warnings.length = 0
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      rateLimitService: new InMemoryRateLimitService(),
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)
  })

  const call = (response = new TestResponse()) =>
    fetchData(new TestRequest('/test', 'get') as any, response as any, {
      bubbleErrors: true,
    })

  test('an HTTP route is refused after the global limit', async () => {
    addGlobalRateLimiter({ limit: 2, windowMs: 60_000 })
    wireRoute()
    await call()
    await call()
    await assert.rejects(call(), TooManyRequestsError)
  })

  test('the refusal sets Retry-After on the response', async () => {
    addGlobalRateLimiter({ limit: 1, windowMs: 60_000 })
    wireRoute()
    await call()
    const response = new TestResponse()
    await assert.rejects(call(response), TooManyRequestsError)
    assert.ok(Number(response.headersMap.get('Retry-After')) >= 1)
  })

  test("a function's `rateLimit: false` is never limited", async () => {
    addGlobalRateLimiter({ limit: 1, windowMs: 60_000 })
    wireRoute({ rateLimit: false })
    for (let i = 0; i < 4; i++) await call()
  })

  test("a function's own `rateLimit` replaces the global one", async () => {
    addGlobalRateLimiter({ limit: 1, windowMs: 60_000 })
    wireRoute({ rateLimit: { limit: 3, windowMs: 60_000 } })
    for (let i = 0; i < 3; i++) await call()
    await assert.rejects(call(), TooManyRequestsError)
  })

  test('internal calls to the same function are never counted', async () => {
    addGlobalRateLimiter({ limit: 1, windowMs: 60_000 })
    wireRoute()
    const singletonServices = pikkuState(null, 'package', 'singletonServices')!
    for (let i = 0; i < 5; i++) {
      await runPikkuFunc('rpc', 'pikku_func_name', 'pikku_func_name', {
        singletonServices,
        data: () => ({}),
        wire: {},
      } as any)
    }
  })
})
