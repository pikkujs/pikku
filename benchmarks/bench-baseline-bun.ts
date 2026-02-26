import autocannon from 'autocannon'
import { scenarios, type Scenario } from './bench-shared.js'

const PORT = 3951
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
  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const path = new URL(req.url).pathname

      if (req.method === 'GET') {
        if (path === '/bare') {
          return Response.json({ ok: true })
        }
        if (path === '/middleware') {
          const session = { userId: 'bench-user' }
          void session
          return Response.json({ ok: true })
        }
        if (path.startsWith('/items/')) {
          const id = path.split('/')[2]
          return Response.json({ id })
        }
      }

      if (req.method === 'POST') {
        if (path === '/schema') {
          const data = await req.json()
          return Response.json({ echo: data.name })
        }
        if (path === '/full') {
          const session = { userId: 'bench-user' }
          void session
          const data = await req.json()
          return Response.json({ echo: data.name })
        }
      }

      return new Response('Not Found', { status: 404 })
    },
  })

  console.log(`\nBaseline Bun server on :${PORT}`)
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
