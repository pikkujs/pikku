/**
 * Verifies rate limits against real generated code and real stores.
 *
 * The unit tests wire a function by hand and call the limiter with a fake
 * request. What is worth checking here is the assumptions they replaced: that
 * `pikku` carries a function's `rateLimit` into the generated function map,
 * that the HTTP and MCP runners the generated bootstrap registers actually call
 * the limiter, that an internal `rpc` call to a limited function is never
 * counted, and that the same limits hold on every store a project can pick —
 * in memory, Kysely over SQLite, and Redis.
 *
 * Redis runs when REDIS_URL is set. CI sets RATE_LIMITS_REQUIRE_REDIS so a
 * missing server fails the run instead of skipping it.
 */

import { createConfig, createSingletonServices } from '../src/services.js'
import '../.pikku/pikku-bootstrap.gen.js'

import { fetch } from '@pikku/core/http'
import { addGlobalRateLimiter } from '@pikku/core/middleware'
import { MCPError, runMCPTool } from '@pikku/core/mcp'
import { InMemoryRateLimitService } from '@pikku/core/services'
import type { RateLimitService } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import {
  applyPikkuSchemas,
  KyselyRateLimitService,
  rateLimitSchema,
  type KyselyPikkuDB,
} from '@pikku/kysely'
import { RedisRateLimitService } from '@pikku/redis'
import Database from 'better-sqlite3'
import { Redis } from 'ioredis'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'

const BASE = 'http://localhost'
const GLOBAL_LIMIT = 3
const HOUR = 60 * 60_000

interface TestResult {
  name: string
  passed: boolean
  error?: string
}
const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  ✗ ${name}: ${e.message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

const call = (method: 'GET' | 'POST', path: string, ip: string) =>
  fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    })
  )

const statuses = async (
  method: 'GET' | 'POST',
  path: string,
  ip: string,
  times: number
) => {
  const out: number[] = []
  for (let i = 0; i < times; i++)
    out.push((await call(method, path, ip)).status)
  return out
}

const mcpWire = {
  sendResourceUpdated: () => {},
  enableResources: async () => true,
  enablePrompts: async () => true,
  enableTools: async () => true,
}

const callTool = async (name: string) => {
  try {
    await runMCPTool(
      { jsonrpc: '2.0', id: 1, params: {} },
      { mcp: mcpWire as never },
      name
    )
    return 'ok'
  } catch (e) {
    if (e instanceof MCPError) return e.error.code
    throw e
  }
}

type Backend = {
  name: string
  create: () => Promise<RateLimitService>
  /** A second service on the same store, as a restarted process would open it. */
  reopen?: () => Promise<RateLimitService>
  cleanup?: () => Promise<void>
}

const sqliteBackend = (): Backend => {
  const db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
  const open = async () => {
    const service = new KyselyRateLimitService(db)
    await service.init()
    return service
  }
  return {
    name: 'kysely (sqlite)',
    create: async () => {
      await applyPikkuSchemas(db, [rateLimitSchema])
      return open()
    },
    reopen: open,
  }
}

const redisBackend = (url: string): Backend => {
  const redis = new Redis(url)
  const keyPrefix = `verify-${crypto.randomUUID()}`
  const open = async () => new RedisRateLimitService(redis, { keyPrefix })
  return {
    name: 'redis',
    create: open,
    reopen: open,
    cleanup: async () => {
      const keys = await redis.keys(`${keyPrefix}:*`)
      if (keys.length > 0) await redis.del(...keys)
      await redis.quit()
    },
  }
}

async function verifyBackend(backend: Backend): Promise<void> {
  const singleton = pikkuState(null, 'package', 'singletonServices')!
  const service = await backend.create()
  singleton.rateLimitService = service
  // Each backend keeps its own client addresses, so none of its scenarios can
  // see another's counts, whichever store they share.
  const ip = (label: string) => `${backend.name}-${label}`

  console.log(`\n--- ${backend.name} ---`)

  await runTest('a route is refused after the global limit', async () => {
    assertEqual(
      await statuses('GET', '/items', ip('global'), GLOBAL_LIMIT + 1),
      [200, 200, 200, 429],
      'GET /items statuses'
    )
  })

  await runTest('a refusal says when to come back', async () => {
    const refused = await call('GET', '/items', ip('global'))
    assertEqual(refused.status, 429, 'status')
    const retryAfter = Number(refused.headers.get('retry-after'))
    if (!(retryAfter >= 1 && retryAfter <= HOUR / 1000)) {
      throw new Error(
        `Retry-After ${retryAfter} is not within the ${HOUR / 1000}s window`
      )
    }
  })

  await runTest(
    'callers are counted apart by the configured header',
    async () => {
      assertEqual(
        (await call('GET', '/items', ip('other'))).status,
        200,
        'status'
      )
    }
  )

  await runTest("a function's own limit replaces the global one", async () => {
    assertEqual(
      await statuses('POST', '/contact', ip('contact'), 3),
      [200, 200, 429],
      'POST /contact statuses'
    )
  })

  await runTest(
    'a function that sets `rateLimit: false` is never limited',
    async () => {
      const all = await statuses('GET', '/health', ip('health'), 10)
      assertEqual(new Set(all), new Set([200]), 'GET /health statuses')
    }
  )

  await runTest('internal calls are never counted', async () => {
    // Three external calls, each making six internal calls to a limited
    // function. Counted, the first would already have been refused.
    assertEqual(
      await statuses('POST', '/fan-out', ip('fan'), GLOBAL_LIMIT + 1),
      [200, 200, 200, 429],
      'POST /fan-out statuses'
    )
    // The internal calls left this caller's /items count untouched.
    assertEqual(
      (await call('GET', '/items', ip('fan'))).status,
      200,
      'GET /items'
    )
  })

  await runTest('an MCP tool is refused after the global limit', async () => {
    const out: unknown[] = []
    for (let i = 0; i < GLOBAL_LIMIT + 1; i++) {
      out.push(await callTool('searchCatalog'))
    }
    assertEqual(out, ['ok', 'ok', 'ok', -32000], 'searchCatalog results')
  })

  await runTest(
    'an MCP tool that sets `rateLimit: false` is never limited',
    async () => {
      for (let i = 0; i < 10; i++) {
        assertEqual(await callTool('pingTool'), 'ok', `pingTool call ${i + 1}`)
      }
    }
  )

  if (backend.reopen) {
    await runTest('a restarted process still sees the count', async () => {
      singleton.rateLimitService = await backend.reopen!()
      assertEqual(
        (await call('POST', '/contact', ip('contact'))).status,
        429,
        'POST /contact after reopening the store'
      )
    })
  }

  await runTest(
    'with a limit set and no service, calls are refused',
    async () => {
      singleton.rateLimitService = undefined
      assertEqual(
        (await call('GET', '/items', ip('none'))).status,
        500,
        'status'
      )
    }
  )

  await runTest('a failing store answers 503', async () => {
    singleton.rateLimitService = {
      hit: async () => {
        throw new Error('store down')
      },
    }
    assertEqual((await call('GET', '/items', ip('down'))).status, 503, 'status')
  })

  await backend.cleanup?.()
}

async function main(): Promise<void> {
  const config = await createConfig()
  await createSingletonServices(config)
  addGlobalRateLimiter({
    limit: GLOBAL_LIMIT,
    windowMs: HOUR,
    ipHeader: 'x-forwarded-for',
  })

  console.log('\nRate Limit Verifier')
  console.log('===================')

  await verifyBackend({
    name: 'in-memory',
    create: async () => new InMemoryRateLimitService(),
  })
  await verifyBackend(sqliteBackend())

  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    await verifyBackend(redisBackend(redisUrl))
  } else if (process.env.RATE_LIMITS_REQUIRE_REDIS) {
    results.push({
      name: 'redis',
      passed: false,
      error: 'REDIS_URL is not set but RATE_LIMITS_REQUIRE_REDIS is',
    })
    console.log('\n  ✗ redis: REDIS_URL is not set')
  } else {
    console.log('\n--- redis ---\n  skipped: REDIS_URL is not set')
  }

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
