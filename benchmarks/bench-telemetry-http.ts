import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import {
  arch,
  cpus,
  tmpdir,
  loadavg,
  platform,
  release,
  totalmem,
} from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import autocannon from 'autocannon'
import { decodeTraces, type DecodedSpan } from '@pikku/core/testing'
import { stats } from './bench-telemetry-shared.js'

/**
 * Per-request telemetry cost over real HTTP, against the server `pikku deploy --provider standalone` produces (a Bun executable
 * compiled from benchmarks/http-app). Fresh server process per cell, cells interleaved in shuffled rounds, the load comes from
 * autocannon in this process, CPU is the server process's own CPU time (`ps`, user + system, every thread) over the measured window.
 *
 *   tsx benchmarks/bench-telemetry-http.ts [--runs 5] [--warmup 5] [--duration 10] [--connections 16]
 *        [--rate 8000] [--levels L0,LE,L3] [--scenarios bare,full] [--out file] [--no-build]
 *   tsx benchmarks/bench-telemetry-http.ts trace     one `full` request at L3, printed as a span tree
 *   tsx benchmarks/bench-telemetry-http.ts profile   bun --cpu-prof of the server under load at L0 and LE (profiles in --profile-dir)
 *
 * L0 PIKKU_TELEMETRY=0. LE no PIKKU_OTLP_ENDPOINT (real tracer, empty sink registry). L3 PIKKU_OTLP_ENDPOINT to a loopback sink.
 */
const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, 'http-app')
const unitDir = join(appDir, '.deploy', 'standalone', 'benchmarks-http-app')
const binary = join(unitDir, 'server')
const pikkuBin = resolve(
  here,
  '..',
  'packages',
  'cli',
  'dist',
  'bin',
  'pikku.js'
)

const argv = process.argv.slice(2)
const mode = ['trace', 'profile'].includes(argv[0] ?? '') ? argv[0]! : 'matrix'
const arg = (name: string, fallback: string) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (argv[at + 1] ?? fallback)
}
const runs = Number(arg('runs', '5'))
const warmupS = Number(arg('warmup', '5'))
const durationS = Number(arg('duration', '10'))
const connections = Number(arg('connections', '16'))
const rate = Number(arg('rate', '8000'))
const levels = arg('levels', 'L0,LE,L3').split(',') as Level[]
const scenarioNames = arg('scenarios', 'bare,full').split(',')
const outFile = resolve(here, arg('out', 'telemetry-http-results.json'))
const profileDir = resolve(
  arg('profile-dir', join(tmpdir(), 'pikku-http-bench-profiles'))
)

type Level = 'L0' | 'LE' | 'L3'
const scenarios: Record<
  string,
  { method: 'GET' | 'POST'; path: string; body?: string }
> = {
  bare: { method: 'GET', path: '/bare' },
  full: {
    method: 'POST',
    path: '/full',
    body: JSON.stringify({ name: 'bench' }),
  },
}

const run = (cmd: string, args: string[], cwd: string) => {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf-8' })
  if (result.status !== 0)
    throw new Error(
      `${cmd} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`
    )
  return result.stdout.trim()
}

/** `pikku all`, `pikku deploy plan --provider standalone`, then `bun build --compile` of the unit's bundle. */
const build = () => {
  console.error('building the standalone unit...')
  run('node', [pikkuBin, 'all'], appDir)
  run(
    'node',
    [
      pikkuBin,
      'deploy',
      'plan',
      '--provider',
      'standalone',
      '--result-file',
      '.deploy/standalone/plan-result.json',
    ],
    appDir
  )
  run(
    'bun',
    ['build', '--compile', `--outfile=${binary}`, join(unitDir, 'bundle.js')],
    unitDir
  )
}

const freePort = async () => {
  const { createServer } = await import('node:net')
  return new Promise<number>((res, rej) => {
    const probe = createServer()
    probe.once('error', rej)
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as { port: number }).port
      probe.close(() => res(port))
    })
  })
}

const startSink = async () => {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', join(here, 'bench-telemetry-sink.ts')],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  const port = await new Promise<number>((res, rej) => {
    child.stdout!.once('data', (d) => res(JSON.parse(String(d)).sinkPort))
    child.once('exit', () => rej(new Error('sink exited')))
  })
  return { child, endpoint: `http://127.0.0.1:${port}/v1/otlp`, port }
}

const levelEnv = (level: Level, endpoint?: string): Record<string, string> =>
  level === 'L0'
    ? { PIKKU_TELEMETRY: '0' }
    : level === 'L3'
      ? { PIKKU_OTLP_ENDPOINT: endpoint! }
      : {}

type Server = { child: ChildProcess; port: number; stop(): Promise<void> }

const startServer = async (
  level: Level,
  endpoint?: string,
  command: string[] = [binary]
): Promise<Server> => {
  const port = await freePort()
  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
  }
  delete env.PIKKU_TELEMETRY
  delete env.PIKKU_OTLP_ENDPOINT
  Object.assign(env, levelEnv(level, endpoint))
  const child = spawn(command[0]!, command.slice(1), {
    env,
    cwd: unitDir,
    stdio: 'ignore',
  })
  const exited = new Promise<void>((r) => child.once('exit', () => r()))
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null)
      throw new Error('the server exited during start')
    try {
      const res = await fetch(`http://127.0.0.1:${port}/bare`)
      if (res.ok) break
    } catch {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  return {
    child,
    port,
    async stop() {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      await exited
      clearTimeout(timer)
    },
  }
}

/** Process CPU seconds from `ps` (user + system, all threads, 10 ms resolution): [[dd-]hh:]mm:ss.cc */
const cpuSeconds = (pid: number) => {
  const text = run('ps', ['-o', 'cputime=', '-p', String(pid)], here).trim()
  const [days, clock] = text.includes('-') ? text.split('-') : ['0', text]
  const parts = clock!.split(':').map(Number)
  return (
    parts.reduce((total, part) => total * 60 + part, 0) + Number(days) * 86400
  )
}

/** One autocannon window. With `rate` (req/s over all connections) it is open-loop-ish and every response time is kept (float ms). */
const load = (
  port: number,
  scenario: (typeof scenarios)[string],
  seconds: number,
  rate?: number,
  keepLatency = false
) =>
  new Promise<{ result: any; latenciesMs: Float64Array }>(
    (resolveLoad, reject) => {
      const kept: number[] = []
      const instance = autocannon(
        {
          url: `http://127.0.0.1:${port}${scenario.path}`,
          method: scenario.method,
          connections,
          duration: seconds,
          ...(rate ? { overallRate: rate } : {}),
          ...(scenario.body
            ? {
                body: scenario.body,
                headers: { 'content-type': 'application/json' },
              }
            : {}),
        },
        (error: Error | null, result: any) =>
          error
            ? reject(error)
            : resolveLoad({
                result,
                latenciesMs: Float64Array.from(kept).sort(),
              })
      ) as any
      if (keepLatency)
        instance.on(
          'response',
          (_c: unknown, _s: number, _b: number, ms: number) => kept.push(ms)
        )
    }
  )

type Cell = {
  level: Level
  scenario: string
  requests: number
  non2xx: number
  errors: number
  /** Closed loop, no rate limit: throughput and the CPU per request when the server is saturated. */
  reqPerSec: number
  cpuUsPerRequestSaturated: number
  /** Fixed rate (RATE req/s): latency and CPU per request at a load every level can carry. */
  rateAchieved: number
  p50Ms: number
  p99Ms: number
  cpuUsPerRequest: number
}

const runCell = async (level: Level, scenarioName: string): Promise<Cell> => {
  const sink = level === 'L3' ? await startSink() : undefined
  const server = await startServer(level, sink?.endpoint)
  try {
    const scenario = scenarios[scenarioName]!
    await load(server.port, scenario, warmupS)
    await new Promise((r) => setTimeout(r, 500))
    const satBefore = cpuSeconds(server.child.pid!)
    const saturated = (await load(server.port, scenario, durationS)).result
    const satCpuUs = (cpuSeconds(server.child.pid!) - satBefore) * 1e6
    await new Promise((r) => setTimeout(r, 1000))
    const before = cpuSeconds(server.child.pid!)
    const fixed = await load(server.port, scenario, durationS, rate, true)
    const cpuUs = (cpuSeconds(server.child.pid!) - before) * 1e6
    const lat = fixed.latenciesMs
    const at = (p: number) =>
      lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] ?? 0
    return {
      level,
      scenario: scenarioName,
      requests: fixed.result.requests.total,
      non2xx: saturated.non2xx + fixed.result.non2xx,
      errors: saturated.errors + fixed.result.errors,
      reqPerSec: saturated.requests.average,
      cpuUsPerRequestSaturated: satCpuUs / saturated.requests.total,
      rateAchieved: fixed.result.requests.average,
      p50Ms: at(0.5),
      p99Ms: at(0.99),
      cpuUsPerRequest: cpuUs / fixed.result.requests.total,
    }
  } finally {
    await server.stop()
    sink?.child.kill('SIGTERM')
  }
}

const machine = () => ({
  platform: `${platform()} ${release()} ${arch()}`,
  cpu: cpus()[0]?.model,
  cores: cpus().length,
  memGB: Math.round(totalmem() / 2 ** 30),
  node: process.version,
  bun: run('bun', ['--version'], here),
  loadavgAtStart: loadavg().map((v) => Number(v.toFixed(2))),
  commit: run('git', ['rev-parse', '--short', 'HEAD'], here),
})

const shuffle = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

const matrix = async () => {
  const info = machine()
  console.error(JSON.stringify(info))
  const cells = levels.flatMap((level) =>
    scenarioNames.map((scenario) => ({ level, scenario }))
  )
  const samples: Cell[] = []
  for (let round = 1; round <= runs; round++) {
    for (const cell of shuffle([...cells])) {
      const sample = await runCell(cell.level, cell.scenario)
      samples.push(sample)
      console.error(
        `run ${round}/${runs} ${cell.level} ${cell.scenario}: ${sample.reqPerSec.toFixed(0)} req/s saturated (cpu ${sample.cpuUsPerRequestSaturated.toFixed(1)}us); at ${rate}/s: p50 ${(sample.p50Ms * 1000).toFixed(0)}us p99 ${(sample.p99Ms * 1000).toFixed(0)}us cpu ${sample.cpuUsPerRequest.toFixed(1)}us${sample.non2xx || sample.errors ? ` NON2XX ${sample.non2xx} ERR ${sample.errors}` : ''}`
      )
    }
  }
  const summary = cells.map(({ level, scenario }) => {
    const mine = samples.filter(
      (s) => s.level === level && s.scenario === scenario
    )
    const med = (pick: (s: Cell) => number) => stats(mine.map(pick))
    return {
      level,
      scenario,
      runs: mine.length,
      reqPerSec: med((s) => s.reqPerSec),
      cpuUsPerRequestSaturated: med((s) => s.cpuUsPerRequestSaturated),
      p50Ms: med((s) => s.p50Ms),
      p99Ms: med((s) => s.p99Ms),
      cpuUsPerRequest: med((s) => s.cpuUsPerRequest),
    }
  })
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        machine: info,
        settings: { runs, warmupS, durationS, connections, rate },
        summary,
        samples,
      },
      null,
      2
    )
  )
  console.log(
    `\nmedian of ${runs} runs, ${connections} connections, ${durationS}s windows; latency and cpu at ${rate} req/s, req/s saturated`
  )
  console.log(
    'level scenario  req/s(sat)  p50us  p99us  cpu-us/req (sd)  vs L0      cpu-us/req saturated'
  )
  for (const row of summary) {
    const base = summary.find(
      (r) => r.level === 'L0' && r.scenario === row.scenario
    )
    const delta =
      base && row.level !== 'L0'
        ? `+${(row.cpuUsPerRequest.median - base.cpuUsPerRequest.median).toFixed(1)}us ${((row.cpuUsPerRequest.median / base.cpuUsPerRequest.median - 1) * 100).toFixed(0)}%`
        : ''
    console.log(
      `${row.level.padEnd(5)} ${row.scenario.padEnd(9)} ${row.reqPerSec.median.toFixed(0).padStart(8)} ${(row.p50Ms.median * 1000).toFixed(0).padStart(7)} ${(row.p99Ms.median * 1000).toFixed(0).padStart(6)}  ${row.cpuUsPerRequest.median.toFixed(1).padStart(8)} (${row.cpuUsPerRequest.stddev.toFixed(1)})  ${delta.padEnd(10)} ${row.cpuUsPerRequestSaturated.median.toFixed(1)}`
    )
  }
  console.log(`\nraw: ${outFile}`)
}

const printTree = (spans: DecodedSpan[]) => {
  const children = new Map<string, DecodedSpan[]>()
  for (const s of spans) {
    const key = s.parentSpanId ?? ''
    children.set(key, [...(children.get(key) ?? []), s])
  }
  const walk = (span: DecodedSpan, depth: number, root: bigint) => {
    const us = Number(span.endTimeUnixNano - span.startTimeUnixNano) / 1000
    const at = Number(span.startTimeUnixNano - root) / 1000
    const attrs = Object.entries(span.attributes)
      .map(
        ([k, v]) =>
          `${k}=${JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x))}`
      )
      .join(' ')
    console.log(
      `${'  '.repeat(depth)}${span.name}  ${us.toFixed(1)}us  (+${at.toFixed(1)}us)  ${attrs}`
    )
    for (const child of children.get(span.spanId) ?? [])
      walk(child, depth + 1, root)
  }
  const ids = new Set(spans.map((s) => s.spanId))
  for (const root of spans.filter(
    (s) => !s.parentSpanId || !ids.has(s.parentSpanId)
  ))
    walk(root, 0, root.startTimeUnixNano)
}

const trace = async () => {
  const { createServer } = await import('node:http')
  const bodies: Buffer[] = []
  const receiver = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      if (req.url?.endsWith('/v1/traces')) bodies.push(Buffer.concat(chunks))
      res.end()
    })
  })
  await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r))
  const endpoint = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/v1/otlp`
  const server = await startServer('L3', endpoint)
  try {
    const scenario = scenarios.full!
    const send = () =>
      fetch(`http://127.0.0.1:${server.port}${scenario.path}`, {
        method: 'POST',
        body: scenario.body,
        headers: { 'content-type': 'application/json' },
      }).then((r) => r.text())
    for (let i = 0; i < 2000; i++) await send()
    await new Promise((r) => setTimeout(r, 1500))
    bodies.length = 0
    for (let i = 0; i < 2000; i++) await send()
    await new Promise((r) => setTimeout(r, 7000))
    const spans = bodies.flatMap((b) => decodeTraces(b).items)
    const us = spans
      .map((s) => Number(s.endTimeUnixNano - s.startTimeUnixNano) / 1000)
      .sort((a, b) => a - b)
    const q = (p: number) =>
      us[Math.min(us.length - 1, Math.floor(us.length * p))]!.toFixed(1)
    console.log(
      `2000 sequential requests -> ${spans.length} spans (names: ${[...new Set(spans.map((s) => s.name))]}); duration us p50 ${q(0.5)} p90 ${q(0.9)} p99 ${q(0.99)} min ${q(0)}`
    )
    console.log('one span tree (the last request):')
    printTree(spans.slice(-1))
  } finally {
    await server.stop()
    await new Promise<void>((r) => receiver.close(() => r()))
  }
}

const profile = async () => {
  mkdirSync(profileDir, { recursive: true })
  for (const level of ['L0', 'LE'] as Level[]) {
    const name = `${level}.cpuprofile`
    const server = await startServer(level, undefined, [
      'bun',
      '--cpu-prof',
      `--cpu-prof-dir=${profileDir}`,
      `--cpu-prof-name=${name}`,
      join(unitDir, 'bundle.js'),
    ])
    await load(server.port, scenarios.full!, warmupS)
    await load(server.port, scenarios.full!, durationS)
    await server.stop()
    console.log(
      `${level}: ${existsSync(join(profileDir, name)) ? join(profileDir, name) : `missing, found ${readdirSync(profileDir)}`}`
    )
  }
}

const main = async () => {
  if (!argv.includes('--no-build') || !existsSync(binary)) build()
  if (mode === 'trace') await trace()
  else if (mode === 'profile') await profile()
  else await matrix()
}
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
