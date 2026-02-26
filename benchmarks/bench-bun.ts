import autocannon from 'autocannon'
import {
  setupBenchmarkRoutes,
  scenarios,
  fetch,
  type Scenario,
} from './bench-shared.js'

const PORT = 3952
const CONNECTIONS = 100
const DURATION = 10
const PIPELINING = 10

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

  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      return await fetch(req, { respondWith404: true })
    },
  })

  console.log(`\nPikku Bun server on :${PORT}`)
  console.log(
    `  autocannon: ${CONNECTIONS} connections, ${DURATION}s, pipelining ${PIPELINING}\n`
  )

  for (const scenario of scenarios) {
    console.log(
      `--- ${scenario.name} (${scenario.method.toUpperCase()} ${scenario.url}) ---`
    )
    const result = await runAutocannonScenario(scenario)
    process.stdout.write(autocannon.printResult(result))
    console.log('')
  }

  server.stop()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
