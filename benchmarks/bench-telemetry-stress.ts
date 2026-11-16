import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import autocannon from 'autocannon'
import type { Level, StressOptions } from './bench-telemetry-shared.js'

/**
 * Stress runs against a real HTTP server (bench-telemetry-server.ts) driven by autocannon, with the OTLP sink in a third process.
 * Launch this driver itself under taskset so the three processes sit on different cores.
 *
 *   tsx benchmarks/bench-telemetry-stress.ts <sweep|payload|soak|failure|shutdown|all> [--server-core N] [--sink-core N]
 *        [--soak-seconds 360] [--tree path] [--tag name] [--out file]
 *
 * `--tree` is the repository whose core is measured (default: this one); results are merged into the --out file under `--tag`.
 */
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name: string, fallback = '') => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? fallback : (args[at + 1] ?? fallback)
}
const command = args[0] ?? 'all'
const serverCore = flag('server-core')
const sinkCore = flag('sink-core')
const tree = resolve(flag('tree', resolve(here, '..')))
const tag = flag('tag', 'local')
const outFile = resolve(here, flag('out', 'telemetry-stress-results.json'))
const soakSeconds = Number(flag('soak-seconds', '360'))

const pin = (core: string, cmd: string[]) =>
  core && existsSync('/usr/bin/taskset')
    ? ['/usr/bin/taskset', '-c', core, ...cmd]
    : cmd

const spawnJson = async (
  core: string,
  script: string,
  scriptArgs: string[],
  key: string
) => {
  const [bin, ...rest] = pin(core, [
    process.execPath,
    '--import',
    'tsx',
    '--expose-gc',
    join(tree, 'benchmarks', script),
    ...scriptArgs,
  ])
  const child = spawn(bin!, rest, {
    cwd: tree,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const info = await new Promise<any>((res, rej) => {
    child.stdout!.once('data', (d) => res(JSON.parse(String(d))))
    child.once('exit', () => rej(new Error(`${script} exited`)))
  })
  return { child, port: info[key] as number }
}

type Sink = Awaited<ReturnType<typeof startSink>>
const startSink = (mode = 'ok', port = 0, decode = false) =>
  spawnJson(
    sinkCore,
    'bench-telemetry-sink.ts',
    ['--mode', mode, '--port', String(port), ...(decode ? ['--decode'] : [])],
    'sinkPort'
  )

const get = async (port: number, path: string, method = 'GET') =>
  (await (
    await fetch(`http://127.0.0.1:${port}${path}`, { method })
  ).json()) as any

type Stack = {
  server: ChildProcess
  serverPort: number
  sink?: Sink
  stats(): Promise<any>
  stop(): void
}

const startStack = async (opts: {
  level: Level
  sinkMode?: string
  server?: { stress?: StressOptions; distinctUsers?: boolean }
  decode?: boolean
}): Promise<Stack> => {
  const sink =
    opts.level === 'L3'
      ? await startSink(opts.sinkMode ?? 'ok', 0, opts.decode)
      : undefined
  const server = await spawnJson(
    serverCore,
    'bench-telemetry-server.ts',
    [
      '--level',
      opts.level,
      '--options',
      JSON.stringify(opts.server ?? {}),
      ...(sink ? ['--sink-port', String(sink.port)] : []),
    ],
    'serverPort'
  )
  const stack: Stack = {
    server: server.child,
    serverPort: server.port,
    sink,
    stats: () => get(server.port, '/__ctl/stats'),
    stop() {
      server.child.kill()
      stack.sink?.child.kill()
    },
  }
  return stack
}

type Load = { connections: number; seconds: number; scenario?: 'bare' | 'full' }
const load = (
  stack: Stack,
  { connections, seconds, scenario = 'full' }: Load
) => {
  const post = scenario === 'full'
  return new Promise<autocannon.Result>((res, rej) => {
    autocannon(
      {
        url: `http://127.0.0.1:${stack.serverPort}/${scenario}`,
        connections,
        duration: seconds,
        method: post ? 'POST' : 'GET',
        timeout: 60,
        ...(post
          ? {
              body: JSON.stringify({ name: 'bench' }),
              headers: { 'content-type': 'application/json' },
            }
          : {}),
      },
      (error, result) => (error ? rej(error) : res(result))
    )
  })
}

const latencyOf = (r: autocannon.Result) => ({
  avgMs: r.latency.average,
  p50Ms: r.latency.p50,
  p99Ms: r.latency.p99,
  p999Ms: (r.latency as any).p99_9,
  maxMs: r.latency.max,
})

const summariseLoad = (r: autocannon.Result) => ({
  reqPerSec: r.requests.average,
  latency: latencyOf(r),
  errors: r.errors,
  timeouts: r.timeouts,
  non2xx: r.non2xx,
  total: r.requests.total,
})

/** Polls /__ctl/stats every `everyMs` while `during` runs; a sample is the window since the previous one. */
const sampled = async <T>(
  stack: Stack,
  everyMs: number,
  during: () => Promise<T>
) => {
  const series: any[] = []
  let last = await stack.stats()
  const t0 = performance.now()
  const poll = async () => {
    try {
      const s = await stack.stats()
      const requests = s.served - last.served
      series.push({
        t: Math.round((performance.now() - t0) / 1000),
        reqPerSec: requests / (s.window.wallMs / 1000),
        cpuUsPerRequest: requests
          ? (s.window.cpuUserUs + s.window.cpuSystemUs) / requests
          : 0,
        rssMb: s.rss / 1048576,
        heapUsedMb: s.heapUsed / 1048576,
        handlerP99Us: s.handlerUs.p99,
        handlerMaxUs: s.handlerUs.max,
        loopLagP99Ms: s.window.eventLoopLagMs.p99,
        loopLagMaxMs: s.window.eventLoopLagMs.max,
        gcPauseMs: s.window.gcPauseMs,
        errors: s.errors,
        dropped: s.exporter?.dropped,
        attributesDropped: s.exporter?.attributesDropped,
        spansStarted: s.tracer?.started,
      })
      last = s
    } catch {}
  }
  const timer = setInterval(() => void poll(), everyMs)
  try {
    return { result: await during(), series }
  } finally {
    clearInterval(timer)
  }
}

/** Warm up, reset the window, then measure: the summary of one steady-state run. */
const measure = async (stack: Stack, run: Load, warmSeconds = 4) => {
  await load(stack, { ...run, seconds: warmSeconds })
  await get(stack.serverPort, '/__ctl/gc', 'POST')
  const before = await stack.stats()
  const heapBefore = (await get(stack.serverPort, '/__ctl/gc', 'POST')) as {
    rss: number
    heapUsed: number
  }
  const { result, series } = await sampled(stack, 2000, () => load(stack, run))
  const after = await stack.stats()
  const heapAfter = (await get(stack.serverPort, '/__ctl/gc', 'POST')) as {
    rss: number
    heapUsed: number
  }
  const requests = after.served - before.served
  const sink = stack.sink ? await get(stack.sink.port, '/__stats') : undefined
  const sum = (o: Record<string, number>) =>
    Object.values(o).reduce((a, b) => a + b, 0)
  return {
    ...summariseLoad(result),
    cpuUsPerRequest: series.length
      ? series.reduce((a, s) => a + s.cpuUsPerRequest, 0) / series.length
      : 0,
    rssDeltaMb: (heapAfter.rss - heapBefore.rss) / 1048576,
    heapDeltaMb: (heapAfter.heapUsed - heapBefore.heapUsed) / 1048576,
    loopLagP99Ms: Math.max(...series.map((s) => s.loopLagP99Ms), 0),
    loopLagMaxMs: Math.max(...series.map((s) => s.loopLagMaxMs), 0),
    handlerP99Us: Math.max(...series.map((s) => s.handlerP99Us), 0),
    gcPauseMsTotal: series.reduce((a, s) => a + s.gcPauseMs, 0),
    requests,
    exporter: after.exporter,
    exportedBytesPerRequest: sink
      ? sum(sink.bytes) / Math.max(1, after.served)
      : undefined,
    postsPerSecond: sink ? sum(sink.posts) / (result.duration || 1) : undefined,
  }
}

const save = (key: string, value: unknown) => {
  const file = existsSync(outFile)
    ? JSON.parse(readFileSync(outFile, 'utf8'))
    : {}
  file.environment = {
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    node: process.version,
    serverCore,
    sinkCore,
    loadavg: loadavg(),
  }
  file[`${tag}/${key}`] = value
  writeFileSync(outFile, JSON.stringify(file, null, 1))
}

const log = (...parts: unknown[]) =>
  console.error(new Date().toISOString().slice(11, 19), ...parts)

const sweep = async () => {
  const out: Record<string, any> = {}
  for (const level of ['L0', 'L3'] as Level[]) {
    for (const connections of [1, 4, 16, 64, 256]) {
      const stack = await startStack({ level })
      try {
        out[`${level}/c${connections}`] = await measure(stack, {
          connections,
          seconds: 8,
        })
        log(
          'sweep',
          level,
          connections,
          Math.round(out[`${level}/c${connections}`].reqPerSec),
          'req/s'
        )
      } finally {
        stack.stop()
      }
    }
  }
  save('sweep', out)
}

const payload = async () => {
  const cases: Record<string, { level: Level; stress?: StressOptions }> = {
    'L3 baseline': { level: 'L3' },
    'L1 baseline': { level: 'L1' },
    'L1 64 allowed-prefix attrs x 1024 chars': {
      level: 'L1',
      stress: {
        spanAttributes: { count: 64, valueLength: 1024, keyPrefix: 'db.k' },
      },
    },
    'L3 64 allowed-prefix attrs x 1024 chars': {
      level: 'L3',
      stress: {
        spanAttributes: { count: 64, valueLength: 1024, keyPrefix: 'db.k' },
      },
    },
    'L3 64 unlisted attrs x 1024 chars (dropped by allow-list)': {
      level: 'L3',
      stress: {
        spanAttributes: { count: 64, valueLength: 1024, keyPrefix: 'x.k' },
      },
    },
    'L3 64 attrs x 100k chars (truncated to 1024)': {
      level: 'L3',
      stress: {
        spanAttributes: { count: 64, valueLength: 100_000, keyPrefix: 'db.k' },
      },
    },
    'L2 log message 100k chars + token text': {
      level: 'L2',
      stress: { logMessageLength: 100_000 },
    },
    'L3 log message 100k chars + token text': {
      level: 'L3',
      stress: { logMessageLength: 100_000 },
    },
    'L3 log message 4k chars + token text': {
      level: 'L3',
      stress: { logMessageLength: 4096 },
    },
    'L3 log fields 50 x 8k chars, depth 6 (PIKKU_OTLP_LOG_FIELDS=1)': {
      level: 'L3',
      stress: { logFields: { fields: 50, valueLength: 8192, depth: 6 } },
    },
  }
  const out: Record<string, any> = {}
  for (const [name, c] of Object.entries(cases)) {
    const stack = await startStack({
      level: c.level,
      server: { stress: c.stress },
    })
    try {
      out[name] = await measure(stack, { connections: 16, seconds: 8 })
      log(
        'payload',
        name,
        Math.round(out[name].reqPerSec),
        'req/s',
        out[name].cpuUsPerRequest.toFixed(0),
        'cpu-us/req'
      )
    } finally {
      stack.stop()
    }
  }
  save('payload', out)
}

const slope = (points: { x: number; y: number }[]) => {
  const n = points.length
  if (n < 2) return 0
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  const num = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0)
  const den = points.reduce((a, p) => a + (p.x - mx) ** 2, 0)
  return den ? num / den : 0
}

const soak = async () => {
  const out: Record<string, any> = {}
  for (const [name, level, distinctUsers] of [
    ['L0', 'L0', true],
    ['L3 (distinct user + trace id per request)', 'L3', true],
  ] as [string, Level, boolean][]) {
    const stack = await startStack({ level, server: { distinctUsers } })
    try {
      await load(stack, { connections: 16, seconds: 5 })
      const gcPoints: { x: number; y: number; rss: number }[] = []
      const gcSample = async () => {
        try {
          const m = await get(stack.serverPort, '/__ctl/gc', 'POST')
          gcPoints.push({
            x: gcPoints.length,
            y: m.heapUsed / 1048576,
            rss: m.rss / 1048576,
          })
        } catch {}
      }
      const gcTimer = setInterval(() => void gcSample(), 30_000)
      const { result, series } = await sampled(stack, 10_000, () =>
        load(stack, { connections: 16, seconds: soakSeconds })
      )
      clearInterval(gcTimer)
      const half = Math.floor(gcPoints.length / 2)
      out[name] = {
        ...summariseLoad(result),
        seconds: soakSeconds,
        distinctUsers,
        // Heap after a forced gc every 30 s: a leak shows here, not in the raw RSS.
        heapAfterGcMb: gcPoints.map((p) => Math.round(p.y * 10) / 10),
        rssAfterGcMb: gcPoints.map((p) => Math.round(p.rss * 10) / 10),
        heapAfterGcSlopeMbPerMin: slope(
          gcPoints.slice(half).map((p) => ({ x: p.x * 0.5, y: p.y }))
        ),
        rssSlopeMbPerMin: slope(
          series
            .slice(Math.floor(series.length / 2))
            .map((s) => ({ x: s.t / 60, y: s.rssMb }))
        ),
        maxRssMb: Math.max(...series.map((s) => s.rssMb)),
        maxLoopLagMs: Math.max(...series.map((s) => s.loopLagMaxMs)),
        series: series.map((s) => ({
          t: s.t,
          rps: Math.round(s.reqPerSec),
          cpuUs: Math.round(s.cpuUsPerRequest),
          rssMb: Math.round(s.rssMb),
          heapMb: Math.round(s.heapUsedMb),
          dropped: s.dropped,
        })),
        exporter: (await stack.stats()).exporter,
      }
      log(
        'soak',
        name,
        Math.round(result.requests.average),
        'req/s',
        'heap slope',
        out[name].heapAfterGcSlopeMbPerMin.toFixed(2),
        'MB/min'
      )
    } finally {
      stack.stop()
    }
  }
  save('soak', out)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const failure = async () => {
  type Fault = {
    name: string
    mode?: string
    down?: boolean
    requestTimeoutMs?: number
    connections?: number
  }
  const faults: Fault[] = [
    { name: 'healthy (control)' },
    { name: 'sink down (connection refused)', down: true },
    {
      name: 'sink down, 3 s request timeout',
      down: true,
      requestTimeoutMs: 3000,
    },
    {
      name: 'sink accepts and never answers (10 s default timeout)',
      mode: 'stall:forever',
    },
    {
      name: 'sink accepts and never answers (3 s timeout)',
      mode: 'stall:forever',
      requestTimeoutMs: 3000,
    },
    { name: 'sink answers after 5 s', mode: 'slow:5000' },
    { name: 'sink returns 500', mode: 'status:500' },
    { name: 'sink returns 429', mode: 'status:429' },
    { name: 'sink returns 400 (rejected, not retried)', mode: 'status:400' },
    {
      name: 'sink down, 128 connections (queue pressure)',
      down: true,
      connections: 128,
    },
  ]
  const out: Record<string, any> = {}
  for (const fault of faults) {
    const stress: StressOptions = {
      exporter: fault.requestTimeoutMs
        ? { requestTimeoutMs: fault.requestTimeoutMs }
        : {},
    }
    const stack = await startStack({ level: 'L3', server: { stress } })
    const sinkPort = stack.sink!.port
    try {
      await load(stack, { connections: 16, seconds: 4 })
      const phases = [
        { name: 'healthy', from: 0, to: 10 },
        { name: 'fault', from: 10, to: 35 },
        { name: 'recovery', from: 35, to: 50 },
      ]
      const heap: Record<string, { rss: number; heapUsed: number }> = {}
      const probe = async (phase: string) => {
        heap[phase] = await get(stack.serverPort, '/__ctl/gc', 'POST')
      }
      const script = (async () => {
        await wait(10_000)
        await probe('end of healthy')
        if (fault.down) stack.sink!.child.kill('SIGKILL')
        else if (fault.mode)
          await get(
            sinkPort,
            `/__mode/${encodeURIComponent(fault.mode)}`,
            'POST'
          ).catch(() => {})
        await wait(25_000)
        await probe('end of fault')
        if (fault.down) stack.sink = await startSink('ok', sinkPort)
        else if (fault.mode)
          await get(sinkPort, '/__mode/ok', 'POST').catch(() => {})
      })()
      const { result, series } = await sampled(stack, 2000, () =>
        load(stack, { connections: fault.connections ?? 16, seconds: 50 })
      )
      await script
      await probe('end of recovery')
      const by = (p: (typeof phases)[number]) =>
        series.filter((s) => s.t > p.from && s.t <= p.to)
      const avg = (rows: any[], key: string) =>
        rows.length ? rows.reduce((a, r) => a + r[key], 0) / rows.length : 0
      const max = (rows: any[], key: string) =>
        Math.max(...rows.map((r) => r[key]), 0)
      const final = series[series.length - 1]
      out[fault.name] = {
        load: summariseLoad(result),
        phases: Object.fromEntries(
          phases.map((p) => {
            const rows = by(p)
            return [
              p.name,
              {
                reqPerSec: avg(rows, 'reqPerSec'),
                cpuUsPerRequest: avg(rows, 'cpuUsPerRequest'),
                handlerP99Us: max(rows, 'handlerP99Us'),
                loopLagP99Ms: max(rows, 'loopLagP99Ms'),
                loopLagMaxMs: max(rows, 'loopLagMaxMs'),
                maxRssMb: max(rows, 'rssMb'),
                droppedAtEnd: rows[rows.length - 1]?.dropped,
              },
            ]
          })
        ),
        memoryAfterGcMb: Object.fromEntries(
          Object.entries(heap).map(([k, v]) => [
            k,
            {
              rss: Math.round(v.rss / 1048576),
              heap: Math.round(v.heapUsed / 1048576),
            },
          ])
        ),
        finalDropped: final?.dropped,
        finalAttributesDropped: final?.attributesDropped,
        series: series.map((s) => ({
          t: s.t,
          rps: Math.round(s.reqPerSec),
          rssMb: Math.round(s.rssMb),
          heapMb: Math.round(s.heapUsedMb),
          lagMaxMs: Math.round(s.loopLagMaxMs),
          dropped: s.dropped,
        })),
      }
      log(
        'failure',
        fault.name,
        'fault rps',
        Math.round(out[fault.name].phases.fault.reqPerSec),
        'healthy rps',
        Math.round(out[fault.name].phases.healthy.reqPerSec)
      )
    } finally {
      stack.stop()
    }
  }
  save('failure', out)
}

const shutdown = async () => {
  const out: Record<string, any> = {}
  for (const [name, mode] of [
    ['healthy sink', 'ok'],
    ['sink never answers', 'stall:forever'],
    ['sink down', 'down'],
  ]) {
    const stack = await startStack({
      level: 'L3',
      sinkMode: mode === 'down' ? 'ok' : mode,
      decode: true,
    })
    try {
      const sinkPort = stack.sink!.port
      if (mode === 'down') stack.sink!.child.kill('SIGKILL')
      await load(stack, { connections: 8, seconds: 6 })
      const before = await stack.stats()
      const closed = await get(stack.serverPort, '/__ctl/close', 'POST')
      const sink = mode === 'down' ? undefined : await get(sinkPort, '/__stats')
      const postsAfterClose = sink?.posts?.traces
      await load(stack, { connections: 1, seconds: 2 })
      const sinkLater =
        mode === 'down' ? undefined : await get(sinkPort, '/__stats')
      out[name] = {
        requestsServed: before.served,
        spansStarted: before.tracer.started,
        closeMs: closed.closeMs,
        spansReceivedBySinkAfterClose: sink?.items?.traces,
        logsReceivedBySinkAfterClose: sink?.items?.logs,
        droppedAtClose: closed.exporter.dropped,
        tracePostsLaterAfterMoreRequests: sinkLater
          ? sinkLater.posts.traces - postsAfterClose
          : undefined,
      }
      log('shutdown', name, JSON.stringify(out[name]))
    } finally {
      stack.stop()
    }
  }
  save('shutdown', out)
}

const commands: Record<string, () => Promise<void>> = {
  sweep,
  payload,
  soak,
  failure,
  shutdown,
}
const run = async () => {
  const names = command === 'all' ? Object.keys(commands) : [command]
  for (const name of names) {
    if (!commands[name]) throw new Error(`unknown command ${name}`)
    log('start', name)
    await commands[name]!()
  }
  console.log(`wrote ${outFile}`)
  process.exit(0)
}
run().catch((error) => {
  console.error(error)
  process.exit(1)
})
