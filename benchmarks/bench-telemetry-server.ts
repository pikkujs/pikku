import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import {
  setupBenchmarkRoutes,
  scenarios,
  fetch,
  distinctUsers,
} from './bench-shared.js'
import {
  buildTelemetry,
  createProbe,
  memorySnapshot,
  type Level,
  type StressOptions,
} from './bench-telemetry-shared.js'
import { createHistogram } from 'node:perf_hooks'

/**
 * A real HTTP server over pikku's `fetch()` for the stress runs (load comes from autocannon in another process).
 *
 *   --level L0..L3 --port N [--sink-port N] [--options JSON {stress, distinctUsers}]
 *
 * Control endpoints: GET /__ctl/stats (resets the window), POST /__ctl/gc, POST /__ctl/close (times telemetry.close()).
 */
const arg = (name: string, fallback?: string) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}
const level = arg('level', 'L0') as Level
const sinkPort = arg('sink-port')
const options = JSON.parse(arg('options', '{}')!) as {
  stress?: StressOptions
  distinctUsers?: boolean
}

const telemetry = buildTelemetry(
  level,
  sinkPort ? `http://127.0.0.1:${sinkPort}` : undefined,
  options.stress
)
setupBenchmarkRoutes({
  singletonServices: telemetry.services,
  logPerRequest: true,
})
distinctUsers(options.distinctUsers === true)

const probe = createProbe()
probe.start()
let handler = createHistogram()
let served = 0
let errors = 0
let closed = false

const json = (res: ServerResponse, body: unknown) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url?.startsWith('/__ctl/')) {
    if (req.url === '/__ctl/stats') {
      const window = probe.stop()
      probe.start()
      const memory = process.memoryUsage()
      const snapshot = {
        served,
        errors,
        window,
        handlerUs: {
          p50: handler.percentile(50) / 1000,
          p99: handler.percentile(99) / 1000,
          max: handler.max / 1000,
        },
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        exporter: telemetry.exporter?.stats,
        tracer: telemetry.tracer?.stats,
        discarded: telemetry.discarded,
      }
      handler = createHistogram()
      return json(res, snapshot)
    }
    if (req.url === '/__ctl/gc') return json(res, memorySnapshot())
    if (req.url === '/__ctl/close') {
      const t0 = performance.now()
      await telemetry.close()
      closed = true
      return json(res, {
        closeMs: performance.now() - t0,
        exporter: telemetry.exporter?.stats,
      })
    }
    res.statusCode = 404
    return res.end()
  }
  const started = performance.now()
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers))
      if (typeof v === 'string') headers.set(k, v)
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers,
      ...(body && req.method !== 'GET' ? { body } : {}),
    })
    const response = await fetch(request)
    const text = await response.text()
    res.statusCode = response.status
    res.setHeader('content-type', 'application/json')
    res.end(text)
    if (response.status >= 400) errors++
  } catch {
    errors++
    res.statusCode = 500
    res.end()
  }
  served++
  handler.record(Math.max(1, Math.round((performance.now() - started) * 1e6)))
}

const server = createServer((req, res) => {
  void handle(req, res)
})

server.keepAliveTimeout = 60_000
server.listen(Number(arg('port', '0')), '127.0.0.1', () => {
  const address = server.address()
  console.log(
    JSON.stringify({
      serverPort: typeof address === 'object' && address ? address.port : 0,
      scenarios: scenarios.map((s) => s.url),
      closed,
    })
  )
})
process.on('SIGTERM', () => process.exit(0))
