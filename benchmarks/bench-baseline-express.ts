import express from 'express'
import autocannon from 'autocannon'
import { scenarios, type Scenario } from './bench-shared.js'

const PORT = 3948
const CONNECTIONS = 100
const DURATION = 10
const PIPELINING = 10

const sessionMiddleware: express.RequestHandler = (_req, _res, next) => {
  ;(_req as any).session = { userId: 'bench-user' }
  next()
}

const sessionMiddleware2: express.RequestHandler = (_req, _res, next) => {
  ;(_req as any).session = { userId: 'bench-user' }
  next()
}

const permissionMiddleware: express.RequestHandler = (_req, _res, next) => {
  next()
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
  const app = express()
  app.use(express.json())

  app.get('/bare', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/schema', (req, res) => {
    res.json({ echo: req.body?.name })
  })

  app.get('/middleware', sessionMiddleware, (_req, res) => {
    res.json({ ok: true })
  })

  app.post(
    '/full',
    sessionMiddleware,
    sessionMiddleware2,
    permissionMiddleware,
    (req, res) => {
      res.json({ echo: req.body?.name })
    }
  )

  app.get('/items/:id', (req, res) => {
    res.json({ id: req.params.id })
  })

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(PORT, () => resolve(s))
  })

  console.log(`\nBaseline Express server on :${PORT}`)
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

  server.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
