import Fastify from 'fastify'
import autocannon from 'autocannon'
import {
  setupBenchmarkRoutes,
  scenarios,
  type Scenario,
} from './bench-shared.js'
import pikkuFastifyPlugin from '@pikku/fastify-plugin'

const PORT = 3946
const CONNECTIONS = 100
const DURATION = 10
const PIPELINING = 10

const flameMode = process.argv.includes('--flame')

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

  const fastify = Fastify()
  await fastify.register(pikkuFastifyPlugin, {
    pikku: {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any,
      respondWith404: true,
    },
  })

  await fastify.listen({ port: PORT })

  console.log(`\nFastify server on :${PORT}`)

  if (flameMode) {
    console.log(
      '\n  --flame mode: server is running. Use clinic flame to profile.\n' +
        '  Press Ctrl+C to stop.\n'
    )
    return
  }

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

  await fastify.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
