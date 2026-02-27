import Fastify from 'fastify'
import autocannon from 'autocannon'
import { scenarios, type Scenario } from './bench-shared.js'

const PORT = 3949
const CONNECTIONS = 100
const DURATION = 10
const PIPELINING = 10

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
  const fastify = Fastify()

  const sessionHook = async (req: any) => {
    req.session = { userId: 'bench-user' }
  }

  const permissionHook = async () => {}

  fastify.get('/bare', async () => {
    return { ok: true }
  })

  fastify.post('/schema', async (req) => {
    return { echo: (req.body as any)?.name }
  })

  fastify.get('/middleware', { preHandler: [sessionHook] }, async () => {
    return { ok: true }
  })

  fastify.post(
    '/full',
    { preHandler: [sessionHook, sessionHook, permissionHook] },
    async (req) => {
      return { echo: (req.body as any)?.name }
    }
  )

  fastify.get('/items/:id', async (req) => {
    return { id: (req.params as any).id }
  })

  await fastify.listen({ port: PORT })

  if (!jsonMode) {
    console.log(`\nBaseline Fastify server on :${PORT}`)
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
      JSON.stringify({ runtime: 'baseline-fastify', scenarios: collected })
    )
  }

  await fastify.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
