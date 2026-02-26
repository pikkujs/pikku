import {
  setupBenchmarkRoutes,
  scenarios,
  createRequest,
  type Scenario,
} from './bench-shared.js'
import { PikkuFetchHTTPRequest } from '@pikku/core/http'
import { pikkuState, httpRouter } from '@pikku/core/internal'

const ITERATIONS = 50_000

function timeSync(label: string, fn: () => void, iterations: number) {
  fn()
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  return performance.now() - start
}

async function timeAsync(
  label: string,
  fn: () => Promise<void>,
  iterations: number
) {
  await fn()
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    await fn()
  }
  return performance.now() - start
}

async function profileScenario(scenario: Scenario) {
  const url = `http://localhost${scenario.url}`
  const init: RequestInit = { method: scenario.method.toUpperCase() }
  if (scenario.body) {
    init.body = scenario.body
    init.headers = {
      'content-type': scenario.contentType || 'application/json',
    }
  }

  const results: Record<string, number> = {}

  // Phase 1: new Request() construction
  results['1. new Request()'] = timeSync(
    'new Request()',
    () => new Request(url, init),
    ITERATIONS
  )

  // Phase 2: new URL() parsing (done inside PikkuFetchHTTPRequest constructor)
  const req = new Request(url, init)
  results['2. new URL(req.url)'] = timeSync(
    'new URL()',
    () => new URL(req.url),
    ITERATIONS
  )

  // Phase 3: PikkuFetchHTTPRequest wrapper construction
  results['3. PikkuFetchHTTPRequest()'] = timeSync(
    'PikkuFetchHTTPRequest',
    () => new PikkuFetchHTTPRequest(new Request(url, init)),
    ITERATIONS
  )

  // Phase 4: httpRouter.match()
  const method = scenario.method as any
  const path = scenario.url
  results['4. httpRouter.match()'] = timeSync(
    'httpRouter.match()',
    () => httpRouter.match(method, path),
    ITERATIONS
  )

  // Phase 5: pikkuState lookups (route + meta)
  results['5. pikkuState lookups'] = timeSync(
    'pikkuState lookups',
    () => {
      const routes = pikkuState(null, 'http', 'routes')
      routes.get(method)?.get(scenario.route)
      const meta = pikkuState(null, 'http', 'meta')
      meta[method]?.[scenario.route]
    },
    ITERATIONS
  )

  // Phase 6: Request.json() body parsing (POST only)
  if (scenario.body) {
    results['6. req.json() parse'] = await timeAsync(
      'req.json()',
      async () => {
        const r = new Request(url, init)
        await r.json()
      },
      ITERATIONS
    )
  }

  // Phase 7: JSON.stringify for response
  const responseData = { echo: 'bench' }
  results['7. JSON.stringify(resp)'] = timeSync(
    'JSON.stringify',
    () => JSON.stringify(responseData),
    ITERATIONS
  )

  // Phase 8: new Response() construction
  const jsonBody = JSON.stringify(responseData)
  const respHeaders = new Headers({ 'content-type': 'application/json' })
  results['8. new Response()'] = timeSync(
    'new Response()',
    () => new Response(jsonBody, { status: 200, headers: respHeaders }),
    ITERATIONS
  )

  // Phase 9: Response.text() extraction (what sendResponseToFastify does)
  results['9. response.text()'] = await timeAsync(
    'response.text()',
    async () => {
      const r = new Response(jsonBody, { status: 200, headers: respHeaders })
      await r.text()
    },
    ITERATIONS
  )

  // Phase 10: response.body.getReader() streaming (what sendResponseToExpress does)
  results['10. getReader() stream'] = await timeAsync(
    'getReader()',
    async () => {
      const r = new Response(jsonBody, { status: 200, headers: respHeaders })
      const reader = r.body!.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    },
    ITERATIONS
  )

  // Phase 11: Full header iteration (simulating adapter header copy)
  const sampleHeaders = new Headers({
    'content-type': 'application/json',
    'x-request-id': '123',
    'cache-control': 'no-cache',
  })
  results['11. Headers.forEach()'] = timeSync(
    'Headers.forEach()',
    () => {
      const out: Record<string, string> = {}
      sampleHeaders.forEach((v, k) => {
        out[k] = v
      })
    },
    ITERATIONS
  )

  // Phase 12: Express-style header copy (Object.entries on raw headers)
  const rawHeaders: Record<string, string | string[] | undefined> = {
    'content-type': 'application/json',
    host: 'localhost:3000',
    'user-agent': 'autocannon',
    accept: '*/*',
    connection: 'keep-alive',
  }
  results['12. Object.entries(headers)'] = timeSync(
    'Object.entries',
    () => {
      const h: Record<string, string> = {}
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (value !== undefined) {
          h[key] = Array.isArray(value) ? value.join(', ') : value
        }
      }
    },
    ITERATIONS
  )

  // Phase 13: URL string construction (what adapters do)
  results['13. URL string concat'] = timeSync(
    'URL concat',
    () => {
      void `http://localhost:3000${scenario.url}`
    },
    ITERATIONS
  )

  // Phase 14: new URL() constructor (what fastifyToRequest does)
  results['14. new URL(path, base)'] = timeSync(
    'new URL(path, base)',
    () => new URL(scenario.url, 'http://localhost:3000'),
    ITERATIONS
  )

  return results
}

async function main() {
  setupBenchmarkRoutes()

  console.log(
    `\nPikku hot-path profiler — ${ITERATIONS} iterations per phase\n`
  )

  for (const scenario of scenarios) {
    console.log(
      `=== ${scenario.name} (${scenario.method.toUpperCase()} ${scenario.url}) ===\n`
    )
    const results = await profileScenario(scenario)

    const table = Object.entries(results).map(([phase, totalMs]) => ({
      phase,
      'total (ms)': Number(totalMs.toFixed(2)),
      'per-call (us)': Number(((totalMs / ITERATIONS) * 1000).toFixed(3)),
      'calls/sec': Math.round(ITERATIONS / (totalMs / 1000)),
    }))

    console.table(table)
    console.log('')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
