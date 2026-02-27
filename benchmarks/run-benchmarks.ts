import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const BENCHMARKS = [
  { script: 'bench-fetch.ts', runtime: 'pikku-fetch' },
  { script: 'bench-express.ts', runtime: 'pikku-express' },
  { script: 'bench-fastify.ts', runtime: 'pikku-fastify' },
  { script: 'bench-uws.ts', runtime: 'pikku-uws', optional: true },
  { script: 'bench-baseline-express.ts', runtime: 'baseline-express' },
  { script: 'bench-baseline-fastify.ts', runtime: 'baseline-fastify' },
  { script: 'bench-baseline-uws.ts', runtime: 'baseline-uws', optional: true },
]

const REGRESSION_THRESHOLD = 0.2
const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = resolve(__dirname, 'results.json')

const verify = process.argv.includes('--verify')

type ScenarioResult = {
  requests_per_sec: number
  latency_avg_ms: number
  latency_p99_ms: number
}

type BenchmarkOutput = {
  runtime: string
  scenarios: Record<string, ScenarioResult>
}

type ResultsFile = {
  timestamp: string
  node: string
  results: Record<string, Record<string, ScenarioResult>>
}

function runBenchmark(
  script: string,
  optional: boolean
): BenchmarkOutput | null {
  const cmd = `tsx benchmarks/${script} --json`
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 600_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const lines = stdout.trim().split('\n')
    const jsonLine = lines[lines.length - 1]
    return JSON.parse(jsonLine)
  } catch (err: any) {
    if (optional) {
      console.log(`  ⚠ Skipped ${script} (optional, failed to run)`)
      return null
    }
    console.error(`  ✗ ${script} failed:`)
    if (err.stderr) {
      console.error(err.stderr.toString())
    }
    process.exit(1)
  }
}

function main() {
  console.log('Running all benchmarks...\n')

  const allResults: Record<string, Record<string, ScenarioResult>> = {}

  for (const bench of BENCHMARKS) {
    console.log(`→ ${bench.runtime} (${bench.script})`)
    const output = runBenchmark(bench.script, bench.optional ?? false)
    if (output) {
      allResults[output.runtime] = output.scenarios
      const scenarioCount = Object.keys(output.scenarios).length
      console.log(`  ✓ ${scenarioCount} scenarios collected`)
    }
  }

  console.log('')

  if (verify) {
    let baseline: ResultsFile
    try {
      baseline = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'))
    } catch {
      console.error(`No baseline found at ${RESULTS_PATH}`)
      console.error('Run "yarn benchmark:all" first to generate a baseline.')
      process.exit(1)
    }

    console.log(`Verifying against baseline from ${baseline.timestamp}\n`)

    const regressions: string[] = []

    for (const [runtime, scenarios] of Object.entries(allResults)) {
      if (!runtime.startsWith('pikku-')) {
        continue
      }
      const baselineScenarios = baseline.results[runtime]
      if (!baselineScenarios) {
        console.log(`  ⚠ No baseline for ${runtime}, skipping verification`)
        continue
      }

      for (const [scenario, current] of Object.entries(scenarios)) {
        const base = baselineScenarios[scenario]
        if (!base) {
          continue
        }
        const drop =
          (base.requests_per_sec - current.requests_per_sec) /
          base.requests_per_sec
        if (drop > REGRESSION_THRESHOLD) {
          const pct = (drop * 100).toFixed(1)
          regressions.push(
            `${runtime}/${scenario}: ${current.requests_per_sec.toFixed(0)} req/s vs baseline ${base.requests_per_sec.toFixed(0)} req/s (${pct}% drop)`
          )
        }
      }
    }

    if (regressions.length > 0) {
      console.error('Performance regressions detected (>20% drop in req/s):\n')
      for (const r of regressions) {
        console.error(`  ✗ ${r}`)
      }
      console.error('')
      process.exit(1)
    }

    console.log('All benchmarks within threshold. No regressions detected.')
  } else {
    const resultsFile: ResultsFile = {
      timestamp: new Date().toISOString(),
      node: process.version,
      results: allResults,
    }
    writeFileSync(RESULTS_PATH, JSON.stringify(resultsFile, null, 2) + '\n')
    console.log(`Results written to ${RESULTS_PATH}`)
  }
}

main()
