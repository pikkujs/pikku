import express from 'express'
import autocannon from 'autocannon'
import {
  setupBenchmarkRoutes,
  scenarios,
  type Scenario,
} from './bench-shared.js'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'

const PORT = 3945
const CONNECTIONS = 100
const DURATION = 10
const PIPELINING = 10

const flameMode = process.argv.includes('--flame')
const jsonMode = process.argv.includes('--json')

async function runAutocannonScenario(scenario: Scenario) {
  const url = `http://localhost:${PORT}${scenario.url}`
  const opts: autocannon.Options = {
    url,
    connections: CONNECTIONS,
    duration: DURATION,
    pipelining: PIPELINING,
    method: scenario.method.toUpperCase() as any,
  }
  if (scenario.body) {
    opts.body = scenario.body
    opts.headers = {
      'content-type': scenario.contentType || 'application/json',
    }
  }
  return new Promise<autocannon.Result>((resolve, reject) => {
    autocannon(opts, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

async function main() {
  setupBenchmarkRoutes()

  const app = express()

  app.use(express.json())

  app.use(
    pikkuExpressMiddleware({
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any,
      respondWith404: true,
    })
  )

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(PORT, () => resolve(s))
  })

  if (!jsonMode) {
    console.log(`\nExpress server on :${PORT}`)
  }

  if (flameMode) {
    console.log(
      '\n  --flame mode: server is running. 0x is profiling.\n' +
        '  Press Ctrl+C to stop and generate flamegraph.\n'
    )
    return
  }

  if (!jsonMode) {
    console.log(
      `  autocannon: ${CONNECTIONS} connections, ${DURATION}s, pipelining ${PIPELINING}\n`
    )
  }

  const collected: Record<string, any> = {}

  for (const scenario of scenarios) {
    if (!jsonMode) {
      console.log(
        `--- ${scenario.name} (${scenario.method.toUpperCase()} ${scenario.url}) ---`
      )
    }
    const result = await runAutocannonScenario(scenario)
    if (jsonMode) {
      collected[scenario.name] = {
        requests_per_sec: result.requests.average,
        latency_avg_ms: result.latency.average,
        latency_p99_ms: result.latency.p99,
      }
    } else {
      process.stdout.write(autocannon.printResult(result))
      console.log('')
    }
  }

  if (jsonMode) {
    console.log(
      JSON.stringify({ runtime: 'pikku-express', scenarios: collected })
    )
  }

  server.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
