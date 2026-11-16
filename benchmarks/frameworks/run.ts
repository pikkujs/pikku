import {
  spawn,
  execFile,
  spawnSync,
  type ChildProcess,
} from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {
  arch,
  cpus,
  loadavg,
  platform,
  release,
  tmpdir,
  totalmem,
} from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import autocannon from 'autocannon'
import { seed, BENCH_SECRET } from './shared/seed.js'
import { requestPlan } from './shared/routes.js'
import { openDb } from './shared/db.js'
import type { Adapter, Artifact, Variant } from './types.js'

/**
 * Framework comparison. Every adapter in benchmarks/frameworks/<name>/adapter.ts is discovered and run through the same steps:
 * build once per route count, a conformance gate (the run is refused if any server answers differently), then interleaved cells of
 * fresh processes: cold start, idle RSS, warmup, a saturated window, a fixed-rate window. See README.md.
 *
 *   tsx benchmarks/frameworks/run.ts [--routes 1,30] [--runs 5] [--warmup 4] [--duration 8] [--connections 16]
 *        [--rate auto|<req/s>] [--only pikku,raw-bun] [--out file] [--conformance-only]
 *   tsx benchmarks/frameworks/run.ts profile [--routes 30]
 */
const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const mode = argv[0] === 'profile' ? 'profile' : 'matrix'
const arg = (name: string, fallback: string) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (argv[at + 1] ?? fallback)
}
const routeCounts = arg('routes', mode === 'profile' ? '30' : '1,30')
  .split(',')
  .map(Number)
const runs = Number(arg('runs', '5'))
const warmupS = Number(arg('warmup', '4'))
const durationS = Number(arg('duration', '8'))
const connections = Number(arg('connections', '16'))
const rateArg = arg('rate', 'auto')
const only = arg('only', '').split(',').filter(Boolean)
const outFile = resolve(here, arg('out', 'results.json'))
const work = join(tmpdir(), 'pikku-framework-bench')
const pristineDb = join(work, 'pristine.db')
const cookieFile = join(work, 'cookies.json')
const execFileP = promisify(execFile)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const shuffle = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

const discover = async (): Promise<Adapter[]> => {
  const found: Adapter[] = []
  for (const entry of readdirSync(here, { withFileTypes: true })) {
    const file = join(here, entry.name, 'adapter.ts')
    if (!entry.isDirectory() || !existsSync(file)) continue
    const adapter: Adapter = (await import(pathToFileURL(file).href)).default
    if (only.length === 0 || only.includes(adapter.name)) found.push(adapter)
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
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

type Cookies = { allowed: string; denied: string }
const cookies = (): Cookies => JSON.parse(readFileSync(cookieFile, 'utf-8'))

type Server = {
  child: ChildProcess
  port: number
  dbFile: string
  coldStartMs: number
  sinkPort?: number
  stop(): Promise<void>
}

/** The loopback OTLP sink: the discarding one from the telemetry bench for measured cells, `sink.ts` (decodes and records) for the emit step. */
const startSink = async (record: boolean) => {
  const file = record
    ? join(here, 'sink.ts')
    : join(here, '..', 'bench-telemetry-sink.ts')
  const child = spawn(process.execPath, ['--import', 'tsx', file], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const port = await new Promise<number>((res, rej) => {
    child.stdout!.once('data', (d) => res(JSON.parse(String(d)).sinkPort))
    child.once('exit', () => rej(new Error('sink exited')))
  })
  return { child, port }
}

let serial = 0
/** Fresh process on its own copy of the pristine database. Resolves once the first authenticated request answers 200. */
const startServer = async (
  artifact: Artifact,
  variant: Variant,
  routes: number,
  command = artifact.command,
  recordSink = false
): Promise<Server> => {
  const sink = variant.sink ? await startSink(recordSink) : undefined
  const port = await freePort()
  const dbFile = join(work, `run-${process.pid}-${serial++}.db`)
  copyFileSync(pristineDb, dbFile)
  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    BENCH_DB: dbFile,
    BETTER_AUTH_SECRET: BENCH_SECRET,
    BENCH_ROUTES: String(routes),
  }
  delete env.PIKKU_TELEMETRY
  delete env.PIKKU_OTLP_ENDPOINT
  for (const [key, value] of Object.entries(variant.env))
    env[key] = value.replace('{SINK}', `http://127.0.0.1:${sink?.port}`)
  const t0 = performance.now()
  const child = spawn(command[0]!, command.slice(1), {
    env,
    cwd: artifact.cwd,
    stdio: 'ignore',
  })
  const exited = new Promise<void>((r) => child.once('exit', () => r()))
  const probe = requestPlan(routes)[0]!
  let coldStartMs = -1
  for (let i = 0; i < 1500 && coldStartMs < 0; i++) {
    if (child.exitCode !== null) throw new Error('server exited during start')
    try {
      const res = await fetch(`http://127.0.0.1:${port}${probe.path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookies().allowed,
        },
        body: JSON.stringify(probe.body),
      })
      if (res.status === 200) coldStartMs = performance.now() - t0
      else await sleep(10)
    } catch {
      await sleep(10)
    }
  }
  if (coldStartMs < 0) {
    child.kill('SIGKILL')
    sink?.child.kill('SIGKILL')
    throw new Error('server never answered 200')
  }
  return {
    child,
    port,
    dbFile,
    coldStartMs,
    sinkPort: sink?.port,
    async stop() {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      await exited
      clearTimeout(timer)
      sink?.child.kill('SIGTERM')
    },
  }
}

// ---------- conformance ----------

const expectedBody = (route: number, id: number) => ({
  route,
  id,
  name: `item-${id}`,
  value: ((id - 1) * 7919) % 10007,
})

type Case = {
  name: string
  expectStatus: number
  call: (
    port: number,
    routes: number
  ) => Promise<{ status: number; body: string }>
}
const post = async (
  port: number,
  path: string,
  body: string,
  cookie?: string
) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body,
  })
  return { status: res.status, body: await res.text() }
}

/**
 * Every server must answer these identically: 200 with the same body for a session holding the permission (first and last route),
 * 401 with no cookie, 403 for a session without the permission, 422 for invalid input (Pikku's validation status; the raw app
 * returns the same), and 401 again once the session row is deleted from the database (proves the session is read from the
 * database on each request). Run order matters: the delete case is last.
 */
const conformance = async (
  adapters: Adapter[],
  artifacts: Map<string, Artifact>
) => {
  const c = cookies()
  const problems: string[] = []
  for (const routes of routeCounts) {
    const last = routes - 1
    const bodies = new Map<string, string>()
    for (const adapter of adapters)
      for (const variant of adapter.variants) {
        const server = await startServer(
          artifacts.get(`${adapter.name}:${routes}`)!,
          variant,
          routes
        )
        try {
          const lastPath = `/api/items/r${last}`
          const firstPath = `/api/items/r0`
          const checks: [
            string,
            { status: number; body: string },
            number,
            string?,
          ][] = [
            [
              '200 first route',
              await post(server.port, firstPath, '{"id":5}', c.allowed),
              200,
              JSON.stringify(expectedBody(0, 5)),
            ],
            [
              '200 last route',
              await post(server.port, lastPath, '{"id":77}', c.allowed),
              200,
              JSON.stringify(expectedBody(last, 77)),
            ],
            [
              '401 no cookie',
              await post(server.port, firstPath, '{"id":5}'),
              401,
            ],
            [
              '403 no permission',
              await post(server.port, lastPath, '{"id":5}', c.denied),
              403,
            ],
            [
              '422 bad input',
              await post(server.port, firstPath, '{"id":"x"}', c.allowed),
              422,
            ],
            [
              '422 out of range',
              await post(server.port, firstPath, '{"id":0}', c.allowed),
              422,
            ],
          ]
          const db = openDb(server.dbFile)
          await db.deleteFrom('session').execute()
          await db.destroy()
          checks.push([
            '401 session row deleted',
            await post(server.port, firstPath, '{"id":5}', c.allowed),
            401,
          ])
          for (const [name, got, status, body] of checks) {
            const label = `${variant.id} N=${routes} ${name}`
            if (got.status !== status)
              problems.push(
                `${label}: status ${got.status}, expected ${status}`
              )
            else if (
              body !== undefined &&
              JSON.stringify(JSON.parse(got.body)) !== body
            )
              problems.push(`${label}: body ${got.body} != ${body}`)
            else if (body !== undefined)
              bodies.set(`${variant.id}:${name}`, got.body)
          }
        } finally {
          await server.stop()
        }
      }
  }
  return problems
}

// ---------- measurement ----------

const cpuSeconds = async (pid: number) => {
  const { stdout } = await execFileP('ps', [
    '-o',
    'cputime=',
    '-p',
    String(pid),
  ])
  const text = stdout.trim()
  const [days, clock] = text.includes('-') ? text.split('-') : ['0', text]
  return (
    clock!
      .split(':')
      .map(Number)
      .reduce((t, p) => t * 60 + p, 0) +
    Number(days) * 86400
  )
}
const rssMB = async (pid: number) => {
  const { stdout } = await execFileP('ps', ['-o', 'rss=', '-p', String(pid)])
  return Number(stdout.trim()) / 1024
}

/** One autocannon window over the fixed request plan (same array for every server, round-robin). With `rate`, every response time is kept. */
const load = (
  port: number,
  routes: number,
  seconds: number,
  rate?: number,
  keep = false
) =>
  new Promise<{ result: any; latenciesMs: Float64Array }>(
    (resolveLoad, reject) => {
      const kept: number[] = []
      const cookie = cookies().allowed
      const instance = autocannon(
        {
          url: `http://127.0.0.1:${port}`,
          connections,
          duration: seconds,
          ...(rate ? { overallRate: rate } : {}),
          requests: requestPlan(routes).map((p) => ({
            method: 'POST',
            path: p.path,
            body: JSON.stringify(p.body),
            headers: { 'content-type': 'application/json', cookie },
          })),
        } as any,
        (error: Error | null, result: any) =>
          error
            ? reject(error)
            : resolveLoad({
                result,
                latenciesMs: Float64Array.from(kept).sort(),
              })
      ) as any
      if (keep)
        instance.on(
          'response',
          (_c: unknown, _s: number, _b: number, ms: number) => kept.push(ms)
        )
    }
  )

type Sample = {
  variant: string
  routes: number
  coldStartMs: number
  rssIdleMB: number
  rssLoadMB: number
  reqPerSec: number
  cpuUsPerReqSaturated: number
  rate: number
  rateAchieved: number
  p50Ms: number
  p99Ms: number
  cpuUsPerReq: number
  non2xx: number
  errors: number
  loadavg1: number
}

const runCell = async (
  artifact: Artifact,
  variant: Variant,
  routes: number,
  rate: number | undefined,
  satOnly = false
): Promise<Sample> => {
  const server = await startServer(artifact, variant, routes)
  try {
    const pid = server.child.pid!
    await sleep(1000)
    const rssIdleMB = await rssMB(pid)
    await load(server.port, routes, warmupS)
    await sleep(500)
    const before = await cpuSeconds(pid)
    const sat = load(server.port, routes, durationS)
    await sleep(durationS * 800)
    const rssLoadMB = await rssMB(pid)
    const saturated = (await sat).result
    const satCpuUs = ((await cpuSeconds(pid)) - before) * 1e6
    const base = {
      variant: variant.id,
      routes,
      coldStartMs: server.coldStartMs,
      rssIdleMB,
      rssLoadMB,
      reqPerSec: saturated.requests.average,
      cpuUsPerReqSaturated: satCpuUs / saturated.requests.total,
      non2xx: saturated.non2xx,
      errors: saturated.errors,
      loadavg1: loadavg()[0]!,
    }
    if (satOnly || !rate)
      return {
        ...base,
        rate: 0,
        rateAchieved: 0,
        p50Ms: 0,
        p99Ms: 0,
        cpuUsPerReq: 0,
      }
    await sleep(1000)
    const before2 = await cpuSeconds(pid)
    const fixed = await load(server.port, routes, durationS, rate, true)
    const cpuUs = ((await cpuSeconds(pid)) - before2) * 1e6
    const lat = fixed.latenciesMs
    const at = (p: number) =>
      lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] ?? 0
    return {
      ...base,
      non2xx: base.non2xx + fixed.result.non2xx,
      errors: base.errors + fixed.result.errors,
      rate,
      rateAchieved: fixed.result.requests.average,
      p50Ms: at(0.5),
      p99Ms: at(0.99),
      cpuUsPerReq: cpuUs / fixed.result.requests.total,
    }
  } finally {
    await server.stop()
  }
}

type Emission = {
  variant: string
  requests: number
  seconds: number
  traces: any
  logs: any
  metrics: any
}

/**
 * What each telemetry-enabled variant emits: K sequential authenticated requests against the recording sink, then the sink's
 * counts. Spans, logs and metric points are per request except metrics, which are exported on a timer (total over the window).
 */
const emission = async (
  artifacts: Map<string, Artifact>,
  adapters: Adapter[],
  k = 300
): Promise<Emission[]> => {
  const out: Emission[] = []
  const routes = routeCounts[routeCounts.length - 1]!
  for (const adapter of adapters)
    for (const variant of adapter.variants.filter((v) => v.sink)) {
      const server = await startServer(
        artifacts.get(`${adapter.name}:${routes}`)!,
        variant,
        routes,
        undefined,
        true
      )
      try {
        const started = performance.now()
        const plan = requestPlan(routes)
        for (let i = 0; i < k; i++) {
          const p = plan[i % plan.length]!
          const res = await post(
            server.port,
            p.path,
            JSON.stringify(p.body),
            cookies().allowed
          )
          if (res.status !== 200)
            throw new Error(`emission request ${res.status}`)
        }
        await sleep(12000)
        const records = await (
          await fetch(`http://127.0.0.1:${server.sinkPort}/__records`)
        ).json()
        out.push({
          variant: variant.id,
          requests: k + 1,
          seconds: (performance.now() - started) / 1000,
          ...(records as any),
        })
      } finally {
        await server.stop()
      }
    }
  return out
}

const printEmission = (rows: Emission[]) => {
  console.log(
    '\nwhat each telemetry-enabled variant sends to the sink (per request, K sequential authenticated requests; metrics are timer based so shown as a window total)'
  )
  console.log(
    'variant       spans/req  logs/req  bytes/req(all signals)  metric points (window)  span names per request'
  )
  for (const r of rows) {
    const n = r.requests
    const bytes = r.traces.bytes + r.logs.bytes + r.metrics.bytes
    const grouped: Record<string, number> = {}
    for (const [name, c] of Object.entries(
      r.traces.names as Record<string, number>
    )) {
      const key = name
        .replace(/\/api\/items\/r\d+/, '/api/items/r<i>')
        .replace(/^r\d+$/, 'r<i>')
      grouped[key] = (grouped[key] ?? 0) + c
    }
    const names = Object.entries(grouped)
      .map(([name, c]) => `${name} x${(c / n).toFixed(2)}`)
      .join(', ')
    console.log(
      `${r.variant.padEnd(13)} ${(r.traces.items / n).toFixed(2).padStart(9)} ${(r.logs.items / n).toFixed(2).padStart(9)} ${(bytes / n).toFixed(0).padStart(21)} ${String(r.metrics.items).padStart(22)}  ${names || '(none)'}`
    )
  }
}

const machine = () => {
  const bun = spawnSync('bun', ['--version'], {
    encoding: 'utf-8',
  }).stdout.trim()
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: here,
    encoding: 'utf-8',
  }).stdout.trim()
  const load1 = loadavg()
  const cores = cpus().length
  return {
    platform: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model,
    cores,
    memGB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
    bun,
    commit,
    loadavgAtStart: load1.map((v) => Number(v.toFixed(2))),
    loadWarning:
      load1[0]! > cores * 0.5
        ? `HIGH LOAD: 1-min load average ${load1[0]!.toFixed(1)} on ${cores} cores, numbers are noisy`
        : null,
  }
}

const bunBaselineBytes = () => {
  const dir = join(work, 'baseline')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'empty.ts'), 'console.log("")\n')
  spawnSync('bun', [
    'build',
    '--compile',
    `--outfile=${join(dir, 'empty')}`,
    join(dir, 'empty.ts'),
  ])
  return statSync(join(dir, 'empty')).size
}

const main = async () => {
  mkdirSync(work, { recursive: true })
  const adapters = await discover()
  if (adapters.length === 0) throw new Error('no adapters found')
  const info = machine()
  console.error(JSON.stringify(info))
  if (info.loadWarning) console.error(`WARNING ${info.loadWarning}`)

  console.error(
    'setup: seeding the database and logging in once (outside every measured window)...'
  )
  await seed(pristineDb, cookieFile)

  const artifacts = new Map<string, Artifact>()
  for (const routes of routeCounts)
    for (const adapter of adapters) {
      console.error(`building ${adapter.name} for N=${routes}...`)
      artifacts.set(`${adapter.name}:${routes}`, await adapter.prepare(routes))
    }

  if (mode === 'profile') return profile(adapters, artifacts)

  console.error('conformance...')
  const problems = await conformance(adapters, artifacts)
  if (problems.length) {
    console.error(
      `CONFORMANCE FAILED, refusing to measure:\n${problems.map((p) => `  ${p}`).join('\n')}`
    )
    process.exit(2)
  }
  console.log(
    `conformance: PASS (200 identical body on first+last route, 401 no cookie, 403 no permission, 422 bad input, 401 after session row deleted) for ${adapters.flatMap((a) => a.variants.map((v) => v.id)).join(', ')} at N=${routeCounts.join(',')}`
  )
  if (argv.includes('--conformance-only')) return

  const emissions = await emission(artifacts, adapters)
  printEmission(emissions)

  const cells = routeCounts.flatMap((routes) =>
    adapters.flatMap((adapter) =>
      adapter.variants.map((variant) => ({ adapter, variant, routes }))
    )
  )
  let rate = rateArg === 'auto' ? 0 : Number(rateArg)
  if (rateArg === 'auto') {
    console.error(
      'calibrating the fixed rate (50% of the slowest cell saturated)...'
    )
    const sats: number[] = []
    for (const cell of cells) {
      const s = await runCell(
        artifacts.get(`${cell.adapter.name}:${cell.routes}`)!,
        cell.variant,
        cell.routes,
        undefined,
        true
      )
      sats.push(s.reqPerSec)
    }
    rate = Math.max(100, Math.floor((Math.min(...sats) * 0.5) / 100) * 100)
  }
  console.error(`fixed rate ${rate} req/s`)

  const samples: Sample[] = []
  for (let round = 1; round <= runs; round++)
    for (const cell of shuffle([...cells])) {
      const s = await runCell(
        artifacts.get(`${cell.adapter.name}:${cell.routes}`)!,
        cell.variant,
        cell.routes,
        rate
      )
      samples.push(s)
      console.error(
        `run ${round}/${runs} ${s.variant} N=${s.routes}: ${s.reqPerSec.toFixed(0)} req/s, cpu ${s.cpuUsPerReqSaturated.toFixed(1)}us sat; @${rate}: p50 ${(s.p50Ms * 1000).toFixed(0)}us p99 ${(s.p99Ms * 1000).toFixed(0)}us cpu ${s.cpuUsPerReq.toFixed(1)}us; rss ${s.rssIdleMB.toFixed(0)}/${s.rssLoadMB.toFixed(0)}MB cold ${s.coldStartMs.toFixed(0)}ms load ${s.loadavg1.toFixed(1)}${s.non2xx || s.errors ? ` NON2XX ${s.non2xx} ERR ${s.errors}` : ''}`
      )
    }

  const bunBytes = bunBaselineBytes()
  const rows = cells.map(({ adapter, variant, routes }) => {
    const mine = samples.filter(
      (s) => s.variant === variant.id && s.routes === routes
    )
    const med = (pick: (s: Sample) => number) => median(mine.map(pick))
    return {
      variant: variant.id,
      runtime: adapter.runtime,
      routes,
      runs: mine.length,
      reqPerSec: med((s) => s.reqPerSec),
      p50Us: med((s) => s.p50Ms) * 1000,
      p99Us: med((s) => s.p99Ms) * 1000,
      cpuUsPerReqSaturated: med((s) => s.cpuUsPerReqSaturated),
      cpuUsPerReqAtRate: med((s) => s.cpuUsPerReq),
      rssIdleMB: med((s) => s.rssIdleMB),
      rssLoadMB: med((s) => s.rssLoadMB),
      coldStartMs: med((s) => s.coldStartMs),
      sizeMB: artifacts.get(`${adapter.name}:${routes}`)!.sizeBytes / 1e6,
      maxLoadavg1: Math.max(...mine.map((s) => s.loadavg1)),
    }
  })
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        machine: info,
        settings: { runs, warmupS, durationS, connections, rate, routeCounts },
        bunCompiledEmptyMB: bunBytes / 1e6,
        validators: Object.fromEntries(
          adapters.map((a) => [a.name, a.validator])
        ),
        emissions,
        rows,
        samples,
      },
      null,
      2
    )
  )
  console.log(
    `\nmedian of ${runs} runs, ${connections} connections, ${durationS}s windows, all on Bun ${info.bun}; fixed rate ${rate} req/s (p50/p99/cpu@rate); machine load avg at start ${info.loadavgAtStart.join(' ')}${info.loadWarning ? `  ** ${info.loadWarning} **` : ''}`
  )
  console.log(
    'variant    N   req/s(sat)  cpu-us/req(sat)  p50us  p99us  cpu-us/req@rate  rss idle/load MB  cold ms  size MB  max load'
  )
  for (const r of rows)
    console.log(
      `${r.variant.padEnd(10)} ${String(r.routes).padEnd(3)} ${r.reqPerSec.toFixed(0).padStart(9)} ${r.cpuUsPerReqSaturated.toFixed(1).padStart(15)} ${r.p50Us.toFixed(0).padStart(7)} ${r.p99Us.toFixed(0).padStart(6)} ${r.cpuUsPerReqAtRate.toFixed(1).padStart(15)}  ${r.rssIdleMB.toFixed(0).padStart(7)}/${r.rssLoadMB.toFixed(0).padEnd(8)} ${r.coldStartMs.toFixed(0).padStart(7)} ${r.sizeMB.toFixed(1).padStart(8)} ${r.maxLoadavg1.toFixed(1).padStart(8)}`
    )
  console.log(
    `validators: ${adapters.map((a) => `${a.name}: ${a.validator}`).join('; ')} (CAVEAT: Elysia uses TypeBox, the others @cfworker/json-schema)`
  )
  console.log(
    `bun compiled empty program: ${(bunBytes / 1e6).toFixed(1)} MB (both binaries embed the Bun runtime)\nraw: ${outFile}`
  )
}

// ---------- profile ----------

/** `bun --cpu-prof` of each variant under load, written to <work>/profiles; analyse with profile-report.ts. */
const profile = async (
  adapters: Adapter[],
  artifacts: Map<string, Artifact>
) => {
  const dir = join(work, 'profiles')
  mkdirSync(dir, { recursive: true })
  const routes = routeCounts[0]!
  for (const adapter of adapters)
    for (const variant of adapter.variants) {
      const artifact = artifacts.get(`${adapter.name}:${routes}`)!
      if (!artifact.profileCommand) continue
      const name = `${variant.id}.cpuprofile`
      const server = await startServer(artifact, variant, routes, [
        artifact.profileCommand[0]!,
        '--cpu-prof',
        `--cpu-prof-dir=${dir}`,
        `--cpu-prof-name=${name}`,
        ...artifact.profileCommand.slice(1),
      ])
      await load(server.port, routes, warmupS)
      await load(server.port, routes, durationS)
      await server.stop()
      console.log(join(dir, name))
    }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
