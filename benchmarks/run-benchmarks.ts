import { execSync } from 'child_process'
import { readFileSync, writeFileSync, readdirSync } from 'fs'
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = resolve(__dirname, 'results.json')

const verify = process.argv.includes('--verify')
const merge = process.argv.includes('--merge')
const singleIdx = process.argv.indexOf('--single')
const singleScript = singleIdx !== -1 ? process.argv[singleIdx + 1] : null
const thresholdIdx = process.argv.indexOf('--threshold')
const REGRESSION_THRESHOLD = thresholdIdx !== -1 ? parseFloat(process.argv[thresholdIdx + 1]) / 100 : 0.05

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

function verifyResults(allResults: Record<string, Record<string, ScenarioResult>>) {
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
    console.error(`Performance regressions detected (>${(REGRESSION_THRESHOLD * 100).toFixed(0)}% drop in req/s):\n`)
    for (const r of regressions) {
      console.error(`  ✗ ${r}`)
    }
    console.error('')
    process.exit(1)
  }

  console.log('All benchmarks within threshold. No regressions detected.')
}

function runSingle(script: string) {
  const bench = BENCHMARKS.find((b) => b.script === script)
  if (!bench) {
    console.error(`Unknown benchmark script: ${script}`)
    console.error(`Available: ${BENCHMARKS.map((b) => b.script).join(', ')}`)
    process.exit(1)
  }

  console.log(`→ ${bench.runtime} (${bench.script})`)
  const output = runBenchmark(bench.script, bench.optional ?? false)
  if (output) {
    const scenarioCount = Object.keys(output.scenarios).length
    console.log(`  ✓ ${scenarioCount} scenarios collected`)
    const outPath = resolve(__dirname, `result-${output.runtime}.json`)
    writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n')
    console.log(`  Written to ${outPath}`)
  }
}

function runMergeVerify() {
  const files = readdirSync(__dirname).filter(
    (f) => f.startsWith('result-') && f.endsWith('.json')
  )

  if (files.length === 0) {
    console.error('No result-*.json files found in benchmarks/')
    process.exit(1)
  }

  console.log(`Merging ${files.length} result files...\n`)

  const allResults: Record<string, Record<string, ScenarioResult>> = {}

  for (const file of files) {
    const content: BenchmarkOutput = JSON.parse(
      readFileSync(resolve(__dirname, file), 'utf-8')
    )
    allResults[content.runtime] = content.scenarios
    console.log(`  ✓ ${content.runtime} (${Object.keys(content.scenarios).length} scenarios)`)
  }

  console.log('')

  if (verify) {
    verifyResults(allResults)
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

function main() {
  if (singleScript) {
    runSingle(singleScript)
    return
  }

  if (merge) {
    runMergeVerify()
    return
  }

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
    verifyResults(allResults)
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
