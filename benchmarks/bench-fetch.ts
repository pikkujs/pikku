import {
  setupBenchmarkRoutes,
  scenarios,
  createRequest,
  fetch,
  type Scenario,
} from './bench-shared.js'

const WARMUP = 10_000
const ITERATIONS = 500_000

async function benchmarkScenario(scenario: Scenario) {
  for (let i = 0; i < WARMUP; i++) {
    const req = createRequest(scenario)
    await fetch(req)
  }

  const latencies: number[] = new Array(ITERATIONS)

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

  console.log(
    `\nPikku fetch() benchmark — ${WARMUP} warmup, ${ITERATIONS} iterations\n`
  )

  const results = []
  for (const scenario of scenarios) {
    process.stdout.write(`  Running ${scenario.name}...`)
    const result = await benchmarkScenario(scenario)
    process.stdout.write(` done\n`)
    results.push(result)
  }

  console.log('')
  console.table(results)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
