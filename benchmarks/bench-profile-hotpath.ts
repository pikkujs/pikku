import {
  setupBenchmarkRoutes,
  scenarios,
  type Scenario,
} from './bench-shared.js'
import { fetchData } from '@pikku/core/http'
import { pikkuState, httpRouter } from '@pikku/core/internal'
import { UWSPikkuHTTPRequest } from '@pikku/uws-handler/src/uws-pikku-http-request.js'
import { UWSPikkuHTTPResponse } from '@pikku/uws-handler/src/uws-pikku-http-response.js'
import { PikkuFetchHTTPRequest, PikkuFetchHTTPResponse } from '@pikku/core/http'

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

async function profileScenario(scenario: Scenario) {
  const results: Record<string, number> = {}

  const method = scenario.method as any
  const path = scenario.url
  const headers: Record<string, string> = {}
  if (scenario.contentType) {
    headers['content-type'] = scenario.contentType
  }
  const body = scenario.body ? Buffer.from(scenario.body) : undefined

  // --- Individual pieces we can measure from outside ---

  results['A. new UWSPikkuHTTPRequest()'] = timeSync(() => {
    new UWSPikkuHTTPRequest(method, path, '', headers, body)
  })

  results['B. new UWSPikkuHTTPResponse()'] = timeSync(() => {
    new UWSPikkuHTTPResponse(fakeRes as any, () => false)
  })

  results['C. httpRouter.match()'] = timeSync(() => {
    httpRouter.match(method, path)
  })

  results['D. pikkuState x4 lookups'] = timeSync(() => {
    pikkuState(null, 'http', 'routes').get(method)
    pikkuState(null, 'http', 'meta')
    pikkuState(null, 'function', 'functions')
    pikkuState(null, 'function', 'meta')
  })

  results['E. createWeakUID equiv'] = timeSync(() => {
    Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
  })

  results['F. request.data()'] = await timeAsync(async () => {
    const r = new UWSPikkuHTTPRequest(method, path, '', headers, body)
    await r.data()
  })

  results['G. JSON.stringify(resp)'] = timeSync(() => {
    JSON.stringify({ ok: true })
  })

  results['H. response.status+json+flush'] = timeSync(() => {
    const resp = new UWSPikkuHTTPResponse(fakeRes as any, () => false)
    resp.status(200).json({ ok: true })
    resp.flush()
  })

  // Simulate the object spreads that happen inside executeRoute + runPikkuFunc
  const fakeWire = {
    http: {},
    session: undefined,
    setSession: () => {},
    getSession: () => undefined,
    hasSessionChanged: () => false,
  }
  const fakeServices = {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  }
  results['I. object spreads (5x)'] = timeSync(() => {
    // These simulate the spreads in the hot path:
    // 1. createMiddlewareSessionWireProps result
    const wireProps = {
      session: undefined,
      setSession: () => {},
      getSession: () => undefined,
      hasSessionChanged: () => false,
    }
    // 2. wire = { http, channel, ...wireProps }
    const wire1 = { http: {}, channel: undefined, ...wireProps }
    // 3. wire = { ...wire, wireType: 'http', wireId: 'get:bare' }
    const wire2 = { ...wire1, wireType: 'http', wireId: 'get:bare' }
    // 4. { ...resolvedWire, ...functionWireProps }
    const wire3 = {
      ...wire2,
      session: undefined,
      setSession: () => {},
      clearSession: () => {},
      getSession: () => undefined,
      hasSessionChanged: () => false,
    }
    // 5. { ...singletonServices, ...wireServices }
    const services = { ...fakeServices }
    // 6. { ...wireWithSession, rpc }
    const wire4 = { ...wire3, rpc: undefined }
    void services
    void wire4
  })

  // Simulate string template for logger.info
  const route = 'bare'
  results['J. logger.info template'] = timeSync(() => {
    void `Matched route: ${route} | method: GET | auth: false`
  })

  // parseVersionedId
  results['K. parseVersionedId("bare")'] = timeSync(() => {
    const id = 'bare'
    const idx = id.lastIndexOf('__v')
    if (idx === -1) {
      void { baseName: id, version: null }
    }
  })

  // --- Full end-to-end measurements ---

  results['L. FULL fetchData (native)'] = await timeAsync(async () => {
    const request = new UWSPikkuHTTPRequest(method, path, '', headers, body)
    const response = new UWSPikkuHTTPResponse(fakeRes as any, () => false)
    await fetchData(request, response, { respondWith404: true })
    response.flush()
  })

  results['M. FULL fetchData (Fetch API)'] = await timeAsync(async () => {
    const url = `http://localhost${scenario.url}`
    const init: RequestInit = { method: scenario.method.toUpperCase() }
    if (scenario.body) {
      init.body = scenario.body
      init.headers = {
        'content-type': scenario.contentType || 'application/json',
      }
    }
    const request = new PikkuFetchHTTPRequest(new Request(url, init))
    const response = new PikkuFetchHTTPResponse()
    await fetchData(request, response, { respondWith404: true })
    response.toResponse()
  })

  // Calculate overhead
  const measuredPieces =
    results['A. new UWSPikkuHTTPRequest()'] +
    results['B. new UWSPikkuHTTPResponse()'] +
    results['C. httpRouter.match()'] +
    results['D. pikkuState x4 lookups'] +
    results['E. createWeakUID equiv'] +
    results['F. request.data()'] +
    results['G. JSON.stringify(resp)'] +
    results['H. response.status+json+flush'] +
    results['I. object spreads (5x)'] +
    results['J. logger.info template'] +
    results['K. parseVersionedId("bare")']

  results['N. Sum of measured pieces A-K'] = measuredPieces
  results['O. Unaccounted (L minus N)'] =
    results['L. FULL fetchData (native)'] - measuredPieces

  return results
}

async function main() {
  setupBenchmarkRoutes()

  console.log(
    `\nPikku native uWS hot-path profiler — ${ITERATIONS.toLocaleString()} iterations per phase\n`
  )

  for (const scenario of scenarios.slice(0, 2)) {
    console.log(
      `=== ${scenario.name} (${scenario.method.toUpperCase()} ${scenario.url}) ===\n`
    )
    const results = await profileScenario(scenario)

    const table = Object.entries(results).map(([phase, totalMs]) => ({
      phase,
      'total (ms)': Number(totalMs.toFixed(1)),
      'per-call (µs)': Number(((totalMs / ITERATIONS) * 1000).toFixed(2)),
    }))

    console.table(table)
    console.log('')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
