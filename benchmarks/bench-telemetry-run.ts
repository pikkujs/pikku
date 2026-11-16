import { writeFileSync } from 'node:fs'
import {
  setupBenchmarkRoutes,
  scenarios,
  createRequest,
  fetch,
  distinctUsers,
} from './bench-shared.js'
import {
  buildTelemetry,
  createProbe,
  memorySnapshot,
  percentile,
  type Level,
} from './bench-telemetry-shared.js'

/**
 * One measured run in this process: `fetch()` in a loop, no network between the load and pikku. Prints one JSON line.
 *
 *   --level L0..L3 --scenario bare|schema|middleware|full --sink-port N --warmup-ms N --measure-ms N [--out file]
 *
 * The loop yields to the event loop every YIELD_EVERY requests (setImmediate) so the exporter's timers and its HTTP client run; a
 * loop that never yielded would starve them and the measurement would show an exporter that never sent anything.
 */
const arg = (name: string, fallback?: string) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}
const YIELD_EVERY = 32
const level = arg('level', 'L0') as Level
const scenarioName = arg('scenario', 'bare')!
const warmupMs = Number(arg('warmup-ms', '2000'))
const measureMs = Number(arg('measure-ms', '5000'))
const sinkPort = arg('sink-port')
const cardinality = process.argv.includes('--distinct-users')

const sinkStats = async () =>
  sinkPort
    ? ((await (
        await globalThis.fetch(`http://127.0.0.1:${sinkPort}/__stats`)
      ).json()) as any)
    : undefined

const main = async () => {
  const telemetry = buildTelemetry(
    level,
    sinkPort ? `http://127.0.0.1:${sinkPort}` : undefined
  )
  setupBenchmarkRoutes({
    singletonServices: telemetry.services,
    logPerRequest: true,
  })
  distinctUsers(cardinality)
  const scenario = scenarios.find((s) => s.name === scenarioName)!

  const run = async (ms: number, record?: Float64Array) => {
    const end = performance.now() + ms
    let n = 0
    while (performance.now() < end) {
      for (let i = 0; i < YIELD_EVERY; i++) {
        const req = createRequest(scenario)
        const t0 = performance.now()
        const res = await fetch(req)
        const dt = performance.now() - t0
        if (record && n < record.length) record[n] = dt
        n++
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      }
      await new Promise((resolve) => setImmediate(resolve))
    }
    return n
  }

  await run(warmupMs)
  await new Promise((resolve) => setTimeout(resolve, 600))
  const before = memorySnapshot()
  const exportedBefore = await sinkStats()
  const latencies = new Float64Array(3_000_000)
  const probe = createProbe()
  probe.start()
  const n = await run(measureMs, latencies)
  const result = probe.stop()
  const used = latencies.subarray(0, Math.min(n, latencies.length)).sort()
  const after = memorySnapshot()

  await telemetry.close()
  const exportedAfter = await sinkStats()
  const exporter = telemetry.exporter?.stats
  let sum = 0
  for (const v of used) sum += v
  const delta = (key: 'bytes' | 'posts' | 'items', signal: string) =>
    exportedAfter
      ? (exportedAfter[key][signal] ?? 0) - (exportedBefore?.[key][signal] ?? 0)
      : 0
  const bytes = ['traces', 'logs', 'metrics'].reduce(
    (a, s) => a + delta('bytes', s),
    0
  )
  const out = {
    level,
    scenario: scenarioName,
    requests: n,
    reqPerSec: (n / result.wallMs) * 1000,
    latencyUs: {
      avg: (sum / used.length) * 1000,
      p50: percentile(used, 0.5) * 1000,
      p99: percentile(used, 0.99) * 1000,
      p999: percentile(used, 0.999) * 1000,
    },
    cpuUsPerRequest: (result.cpuUserUs + result.cpuSystemUs) / n,
    cpuUserUsPerRequest: result.cpuUserUs / n,
    cpuSystemUsPerRequest: result.cpuSystemUs / n,
    wallUsPerRequest: (result.wallMs * 1000) / n,
    rssDeltaBytes: after.rss - before.rss,
    heapDeltaBytes: after.heapUsed - before.heapUsed,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    gcCount: result.gcCount,
    gcMajorCount: result.gcMajorCount,
    gcPauseMsPer1k: (result.gcPauseMs / n) * 1000,
    eventLoopLagMs: result.eventLoopLagMs,
    exportedBytesPerRequest: bytes / n,
    exportedPostsInWindow: ['traces', 'logs', 'metrics'].reduce(
      (a, s) => a + delta('posts', s),
      0
    ),
    spansReceivedInWindow: delta('items', 'traces'),
    logsReceivedInWindow: delta('items', 'logs'),
    dropped: exporter?.dropped,
    attributesDropped: exporter?.attributesDropped,
    discarded: telemetry.discarded,
    tracerStats: telemetry.tracer?.stats,
  }
  const line = JSON.stringify(out)
  if (arg('out')) writeFileSync(arg('out')!, line)
  console.log(line)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
