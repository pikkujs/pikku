import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEVELS, stats, type Level } from './bench-telemetry-shared.js'

/**
 * The telemetry cost matrix: every (core build, level, scenario) cell is run RUNS times in a fresh process, the cells interleaved
 * (a shuffled order per round) so drift on a shared machine spreads over all of them. The app and the OTLP sink are separate
 * processes, pinned to different cores with taskset when it exists.
 *
 *   tsx benchmarks/bench-telemetry.ts [--tree name=path@hash ...] [--runs 5] [--warmup-ms 5000] [--measure-ms 5000]
 *        [--app-core N] [--sink-core N] [--scenarios bare,schema,middleware,full] [--out file] [--decode-check]
 *
 * With no --tree the repository this file lives in is the one build, named `local`.
 */
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const all = (name: string) =>
  args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]!] : []))
const one = (name: string, fallback: string) => all(name)[0] ?? fallback

const runs = Number(one('runs', '5'))
const warmupMs = one('warmup-ms', '5000')
const measureMs = one('measure-ms', '5000')
const appCore = one('app-core', '')
const sinkCore = one('sink-core', '')
const scenarioNames = one('scenarios', 'bare,schema,middleware,full').split(',')
const outFile = resolve(here, one('out', 'telemetry-results.json'))
const trees = (
  all('tree').length ? all('tree') : [`local=${resolve(here, '..')}`]
).map((spec) => {
  const [name, rest] = spec.split('=')
  const [path, hash] = rest!.split('@')
  return { name: name!, path: path!, hash: hash ?? '' }
})

const pin = (core: string, cmd: string[]) =>
  core && existsSync('/usr/bin/taskset')
    ? ['/usr/bin/taskset', '-c', core, ...cmd]
    : cmd

const startSink = async (extra: string[] = []) => {
  const [bin, ...rest] = pin(sinkCore, [
    process.execPath,
    '--import',
    'tsx',
    join(here, 'bench-telemetry-sink.ts'),
    ...extra,
  ])
  const child = spawn(bin!, rest, { stdio: ['ignore', 'pipe', 'inherit'] })
  const port = await new Promise<number>((res, rej) => {
    child.stdout!.once('data', (d) => res(JSON.parse(String(d)).sinkPort))
    child.once('exit', () => rej(new Error('sink exited')))
  })
  return { child, port }
}

const runCell = async (
  tree: (typeof trees)[number],
  level: Level,
  scenario: string
) => {
  const sink =
    level === 'L3'
      ? await startSink(
          process.argv.includes('--decode-check') ? ['--decode'] : []
        )
      : undefined
  try {
    const cmd = pin(appCore, [
      process.execPath,
      '--import',
      'tsx',
      '--expose-gc',
      join(tree.path, 'benchmarks', 'bench-telemetry-run.ts'),
      '--level',
      level,
      '--scenario',
      scenario,
      '--warmup-ms',
      warmupMs,
      '--measure-ms',
      measureMs,
      ...(sink ? ['--sink-port', String(sink.port)] : []),
    ])
    const out = await new Promise<string>((res, rej) => {
      const child: ChildProcess = spawn(cmd[0]!, cmd.slice(1), {
        cwd: tree.path,
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      let text = ''
      child.stdout!.on('data', (d) => (text += d))
      child.once('exit', (code) =>
        code === 0 ? res(text) : rej(new Error(`run exited ${code}`))
      )
    })
    return JSON.parse(out.trim().split('\n').pop()!)
  } finally {
    sink?.child.kill()
  }
}

const shuffle = <T>(items: T[], seed: number) => {
  const out = [...items]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const METRICS: Record<string, (r: any) => number> = {
  reqPerSec: (r) => r.reqPerSec,
  latencyAvgUs: (r) => r.latencyUs.avg,
  latencyP50Us: (r) => r.latencyUs.p50,
  latencyP99Us: (r) => r.latencyUs.p99,
  latencyP999Us: (r) => r.latencyUs.p999,
  cpuUsPerRequest: (r) => r.cpuUsPerRequest,
  wallUsPerRequest: (r) => r.wallUsPerRequest,
  rssDeltaMb: (r) => r.rssDeltaBytes / 1048576,
  heapDeltaMb: (r) => r.heapDeltaBytes / 1048576,
  gcPauseMsPer1k: (r) => r.gcPauseMsPer1k,
  gcCount: (r) => r.gcCount,
  eventLoopLagP99Ms: (r) => r.eventLoopLagMs.p99,
  eventLoopLagMaxMs: (r) => r.eventLoopLagMs.max,
  exportedBytesPerRequest: (r) => r.exportedBytesPerRequest,
  droppedSpans: (r) => r.dropped?.spans ?? 0,
  droppedLogs: (r) => r.dropped?.logs ?? 0,
}

const main = async () => {
  const cells = trees.flatMap((tree) =>
    LEVELS.flatMap((level) =>
      scenarioNames.map((scenario) => ({ tree, level, scenario }))
    )
  )
  const results: Record<string, any[]> = {}
  const loadBefore = loadavg()
  const started = new Date().toISOString()
  for (let round = 0; round < runs; round++) {
    for (const cell of shuffle(cells, 1234 + round)) {
      const key = `${cell.tree.name}/${cell.level}/${cell.scenario}`
      const result = await runCell(cell.tree, cell.level, cell.scenario)
      ;(results[key] ??= []).push({ round, ...result, load1: loadavg()[0] })
      console.error(
        `round ${round + 1}/${runs} ${key} ${Math.round(result.reqPerSec)} req/s, ${result.cpuUsPerRequest.toFixed(1)} cpu-us/req`
      )
    }
  }

  const summary: Record<string, any> = {}
  for (const [key, list] of Object.entries(results)) {
    summary[key] = Object.fromEntries(
      Object.entries(METRICS).map(([name, read]) => {
        const s = stats(list.map(read))
        return [
          name,
          { median: s.median, stddev: s.stddev, min: s.min, max: s.max },
        ]
      })
    )
  }
  const cost: Record<string, any> = {}
  for (const [key, row] of Object.entries(summary)) {
    const [tree, level, scenario] = key.split('/')
    if (level === 'L0') continue
    const base = summary[`${tree}/L0/${scenario}`]
    cost[key] = {
      cpuUs: row.cpuUsPerRequest.median - base.cpuUsPerRequest.median,
      cpuPct:
        (row.cpuUsPerRequest.median / base.cpuUsPerRequest.median - 1) * 100,
      wallUs: row.wallUsPerRequest.median - base.wallUsPerRequest.median,
      wallPct:
        (row.wallUsPerRequest.median / base.wallUsPerRequest.median - 1) * 100,
      noisePctOfL0:
        (base.cpuUsPerRequest.stddev / base.cpuUsPerRequest.median) * 100,
      noisePctOfLevel:
        (row.cpuUsPerRequest.stddev / row.cpuUsPerRequest.median) * 100,
    }
  }
  const output = {
    kind: 'telemetry-cost-in-process',
    started,
    finished: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    appCore,
    sinkCore,
    loadAvgBefore: loadBefore,
    loadAvgAfter: loadavg(),
    runsPerCell: runs,
    warmupMs: Number(warmupMs),
    measureMs: Number(measureMs),
    trees,
    summary,
    cost,
    raw: results,
  }
  writeFileSync(outFile, JSON.stringify(output, null, 1))
  console.log(`wrote ${outFile}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
