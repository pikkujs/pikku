import { setupBenchmarkRoutes } from './bench-shared.js'
import { fetchData } from '@pikku/core/http'
import { pikkuState, httpRouter } from '@pikku/core/internal'
import { UWSPikkuHTTPRequest } from '@pikku/uws-handler/src/uws-pikku-http-request.js'
import { UWSPikkuHTTPResponse } from '@pikku/uws-handler/src/uws-pikku-http-response.js'

// Direct imports from source for profiling (not normally exported)
import { createWeakUID, closeWireServices } from '@pikku/core/src/utils.js'
import { combineChannelMiddleware } from '@pikku/core/src/wirings/channel/channel-middleware-runner.js'
import { combineMiddleware } from '@pikku/core/src/middleware-runner.js'
import { runPermissions } from '@pikku/core/src/permissions.js'
import { rpcService } from '@pikku/core/src/wirings/rpc/rpc-runner.js'
import { PikkuSessionService } from '@pikku/core/src/services/user-session-service.js'

const ITERATIONS = 100_000

function timeSync(fn: () => void): number {
  fn()
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    fn()
  }
  return performance.now() - start
}

async function timeAsync(fn: () => Promise<void>): number {
  await fn()
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    await fn()
  }
  return performance.now() - start
}

const fakeRes = {
  cork: (fn: () => void) => fn(),
  writeStatus: () => fakeRes,
  writeHeader: () => fakeRes,
  end: () => fakeRes,
  endWithoutBody: () => fakeRes,
}

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

async function main() {
  setupBenchmarkRoutes()

  const results: Record<string, number> = {}

  const method = 'get' as any
  const path = '/bare'
  const headers: Record<string, string> = {}

  const fakeServices = pikkuState(null, 'package', 'singletonServices')
  const fakeWire = { http: {} } as any

  // -- Individual pieces --

  results['01. createWeakUID (counter)'] = timeSync(() => {
    createWeakUID()
  })

  results['02. getSingletonServices + getCreateWireServices'] = timeSync(() => {
    pikkuState(null, 'package', 'singletonServices')
    pikkuState(null, 'package', 'factories')
  })

  results['03. new PikkuSessionService()'] = timeSync(() => {
    new PikkuSessionService()
  })

  // Warm cache first
  combineChannelMiddleware('http' as any, 'get:bare', { packageName: null })
  results['04. combineChannelMiddleware (cached)'] = timeSync(() => {
    combineChannelMiddleware('http' as any, 'get:bare', { packageName: null })
  })

  combineMiddleware('http' as any, 'get:bare', { packageName: null })
  results['05. combineMiddleware (cached)'] = timeSync(() => {
    combineMiddleware('http' as any, 'get:bare', { packageName: null })
  })

  // runPermissions with no perms (warm cache)
  await runPermissions('http' as any, 'get:bare', {
    services: fakeServices,
    wire: {} as any,
    data: {},
    packageName: null,
  })
  results['06. runPermissions (no perms)'] = await timeAsync(async () => {
    await runPermissions('http' as any, 'get:bare', {
      services: fakeServices,
      wire: {} as any,
      data: {},
      packageName: null,
    })
  })

  results['07. rpcService.getContextRPCService()'] = timeSync(() => {
    rpcService.getContextRPCService(fakeServices, fakeWire, {
      sessionService: undefined,
    })
  })

  // createWireServices: benchmark has `async () => ({})`
  const createWireServices = async () => ({})
  results['08. await createWireServices()'] = await timeAsync(async () => {
    await createWireServices()
  })

  results['09. closeWireServices({})'] = await timeAsync(async () => {
    await closeWireServices(noopLogger as any, {})
  })

  results['10. Object.keys({}).length > 0'] = timeSync(() => {
    const ws = {}
    void (Object.keys(ws).length > 0)
  })

  // Bare async/await overhead
  const asyncNoop = async () => undefined
  results['11. single await (async noop)'] = await timeAsync(async () => {
    await asyncNoop()
  })

  results['12. 5x chained awaits'] = await timeAsync(async () => {
    await asyncNoop()
    await asyncNoop()
    await asyncNoop()
    await asyncNoop()
    await asyncNoop()
  })

  // String template for logger.info
  results['13. logger.info(template)'] = timeSync(() => {
    noopLogger.info(`Matched route: bare | method: GET | auth: false`)
  })

  // 6x .bind() calls (what RPC does)
  const obj = { a() {}, b() {}, c() {}, d() {}, e() {}, f() {} }
  results['14. 6x .bind() calls'] = timeSync(() => {
    obj.a.bind(obj)
    obj.b.bind(obj)
    obj.c.bind(obj)
    obj.d.bind(obj)
    obj.e.bind(obj)
    obj.f.bind(obj)
  })

  // request.header() with try/catch (our requestId fix)
  results['15. try { request.header() } catch'] = timeSync(() => {
    const req = new UWSPikkuHTTPRequest(method, path, '', headers, undefined)
    try {
      req.header('x-request-id')
    } catch {}
  })

  // Full fetchData baseline
  results['99. FULL fetchData (native)'] = await timeAsync(async () => {
    const request = new UWSPikkuHTTPRequest(
      method,
      path,
      '',
      headers,
      undefined
    )
    const response = new UWSPikkuHTTPResponse(fakeRes as any, () => false)
    await fetchData(request, response, { respondWith404: true })
    response.flush()
  })

  console.log(
    `\nGranular hot-path profiler — ${ITERATIONS.toLocaleString()} iterations\n`
  )
  const table = Object.entries(results).map(([phase, totalMs]) => ({
    phase,
    'total (ms)': Number(totalMs.toFixed(1)),
    'per-call (µs)': Number(((totalMs / ITERATIONS) * 1000).toFixed(3)),
  }))
  console.table(table)

  // Ranked suspects
  console.log(`\nRanked by per-call cost:`)
  const items = Object.entries(results)
    .filter(([k]) => !k.startsWith('99.'))
    .sort((a, b) => b[1] - a[1])
  for (const [name, ms] of items) {
    const us = (((ms as number) / ITERATIONS) * 1000).toFixed(3)
    console.log(`  ${us}µs  ${name}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
