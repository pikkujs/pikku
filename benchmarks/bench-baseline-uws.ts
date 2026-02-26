import uWS from 'uWebSockets.js'
import autocannon from 'autocannon'
import { scenarios, type Scenario } from './bench-shared.js'

const PORT = 3950
const CONNECTIONS = 100
const DURATION = 10
const PIPELINING = 10

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

  console.log(`\nBaseline uWS server on :${PORT}`)
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

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
