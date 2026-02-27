import uWS from 'uWebSockets.js'
import autocannon from 'autocannon'
import { scenarios, type Scenario } from './bench-shared.js'

const PORT = 3950
const CONNECTIONS = 100
const DURATION = 10
const PIPELINING = 10

const jsonMode = process.argv.includes('--json')

function readBody(res: uWS.HttpResponse, cb: (body: string) => void) {
  let buffer = ''
  res.onData((chunk, isLast) => {
    buffer += Buffer.from(chunk).toString()
    if (isLast) {
      cb(buffer)
    }
  })
}

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
  const app = uWS.App()

  app.get('/bare', (res) => {
    res.cork(() => {
      res
        .writeHeader('content-type', 'application/json')
        .end(JSON.stringify({ ok: true }))
    })
  })

  app.post('/schema', (res) => {
    readBody(res, (body) => {
      const data = JSON.parse(body)
      res.cork(() => {
        res
          .writeHeader('content-type', 'application/json')
          .end(JSON.stringify({ echo: data.name }))
      })
    })
    res.onAborted(() => {})
  })

  app.get('/middleware', (res) => {
    const session = { userId: 'bench-user' }
    void session
    res.cork(() => {
      res
        .writeHeader('content-type', 'application/json')
        .end(JSON.stringify({ ok: true }))
    })
  })

  app.post('/full', (res) => {
    readBody(res, (body) => {
      const session = { userId: 'bench-user' }
      void session
      const data = JSON.parse(body)
      res.cork(() => {
        res
          .writeHeader('content-type', 'application/json')
          .end(JSON.stringify({ echo: data.name }))
      })
    })
    res.onAborted(() => {})
  })

  app.get('/items/:id', (res, req) => {
    const id = req.getParameter(0)
    res.cork(() => {
      res
        .writeHeader('content-type', 'application/json')
        .end(JSON.stringify({ id }))
    })
  })

  await new Promise<void>((resolve) => {
    app.listen(PORT, (token) => {
      if (!token) throw new Error(`Failed to listen on port ${PORT}`)
      resolve()
    })
  })

  if (!jsonMode) {
    console.log(`\nBaseline uWS server on :${PORT}`)
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
      JSON.stringify({ runtime: 'baseline-uws', scenarios: collected })
    )
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
