import {
  setupBenchmarkRoutes,
  scenarios,
  createRequest,
  fetch,
  type Scenario,
} from './bench-shared.js'

const WARMUP = 10_000
const ITERATIONS = 500_000

const jsonMode = process.argv.includes('--json')

async function benchmarkScenario(scenario: Scenario) {
  for (let i = 0; i < WARMUP; i++) {
    const req = createRequest(scenario)
    await fetch(req)
  }

  const latencies: number[] = Array.from({ length: ITERATIONS })

  for (let i = 0; i < ITERATIONS; i++) {
    const req = createRequest(scenario)
    const start = performance.now()
    await fetch(req)
    latencies[i] = performance.now() - start
  }

  latencies.sort((a, b) => a - b)

  const sum = latencies.reduce((a, b) => a + b, 0)
  const avg = sum / ITERATIONS
  const p50 = latencies[Math.floor(ITERATIONS * 0.5)]
  const p95 = latencies[Math.floor(ITERATIONS * 0.95)]
  const p99 = latencies[Math.floor(ITERATIONS * 0.99)]
  const rps = 1000 / avg

  return {
    scenario: scenario.name,
    'avg (ms)': Number(avg.toFixed(4)),
    'p50 (ms)': Number(p50.toFixed(4)),
    'p95 (ms)': Number(p95.toFixed(4)),
    'p99 (ms)': Number(p99.toFixed(4)),
    'req/s': Math.round(rps),
  }
}

async function main() {
  setupBenchmarkRoutes()

  if (!jsonMode) {
    console.log(
      `\nPikku fetch() benchmark — ${WARMUP} warmup, ${ITERATIONS} iterations\n`
    )
  }

  const results = []
  for (const scenario of scenarios) {
    if (!jsonMode) {
      process.stdout.write(`  Running ${scenario.name}...`)
    }
    const result = await benchmarkScenario(scenario)
    if (!jsonMode) {
      process.stdout.write(` done\n`)
    }
    results.push(result)
  }

  if (jsonMode) {
    const collected: Record<string, any> = {}
    for (const r of results) {
      collected[r.scenario] = {
        requests_per_sec: r['req/s'],
        latency_avg_ms: r['avg (ms)'],
        latency_p99_ms: r['p99 (ms)'],
      }
    }
    console.log(
      JSON.stringify({ runtime: 'pikku-fetch', scenarios: collected })
    )
  } else {
    console.log('')
    console.table(results)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
