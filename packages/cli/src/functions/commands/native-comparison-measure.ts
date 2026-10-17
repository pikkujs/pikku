import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ComparisonEngine,
  ProcessPeak,
  RunMeasurement,
} from './native-comparison-report.js'

export type PsRow = {
  pid: number
  ppid: number
  rssBytes: number
  cpuMs: number
  args: string
}

/**
 * Parses `ps`'s cumulative CPU time: `M:SS.cc` on macOS, `[DD-]HH:MM:SS` on
 * Linux.
 */
export const parseCpuTime = (value: string): number => {
  const [days, clock] = value.includes('-')
    ? [Number(value.split('-')[0]), value.split('-')[1]!]
    : [0, value]
  const parts = clock.split(':').map(Number)
  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + part
  const total = days * 86400 + seconds
  return Number.isFinite(total) ? Math.round(total * 1000) : 0
}

/** Parses `ps -A -o pid=,ppid=,rss=,time=,args=`. */
export const parsePsOutput = (text: string): PsRow[] => {
  const rows: PsRow[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line)
    if (!match) continue
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssBytes: Number(match[3]) * 1024,
      cpuMs: parseCpuTime(match[4]!),
      args: match[5]!.trim(),
    })
  }
  return rows
}

/** `root` and every process below it. */
export const processTree = (rows: PsRow[], root: number): PsRow[] => {
  const children = new Map<number, PsRow[]>()
  for (const row of rows) {
    const list = children.get(row.ppid) ?? []
    list.push(row)
    children.set(row.ppid, list)
  }
  const tree: PsRow[] = []
  const rootRow = rows.find((r) => r.pid === root)
  const queue = rootRow ? [rootRow] : []
  const seen = new Set<number>()
  while (queue.length > 0) {
    const row = queue.shift()!
    if (seen.has(row.pid)) continue
    seen.add(row.pid)
    tree.push(row)
    queue.push(...(children.get(row.pid) ?? []))
  }
  return tree
}

/** Parses `footprint --noCategories -f bytes <pid…>`. */
export const parseFootprintOutput = (
  text: string
): Map<number, { footprintBytes: number; peakBytes: number }> => {
  const result = new Map<
    number,
    { footprintBytes: number; peakBytes: number }
  >()
  const sections = text.split(/^=+\s*$/m)
  for (let i = 0; i < sections.length; i++) {
    const header = /\[(\d+)\]:.*Footprint:\s*(\d+)\s*B/.exec(sections[i]!)
    if (!header) continue
    const body = sections[i + 1] ?? ''
    const current = /phys_footprint:\s*(\d+)\s*B/.exec(body)
    const peak = /phys_footprint_peak:\s*(\d+)\s*B/.exec(body)
    const footprintBytes = Number(current?.[1] ?? header[2])
    result.set(Number(header[1]), {
      footprintBytes,
      peakBytes: Math.max(footprintBytes, Number(peak?.[1] ?? 0)),
    })
  }
  return result
}

/** Parses the POSIX `time -p` report at the end of a captured stderr. */
export const parseTimeReport = (
  stderr: string
): { userMs: number; sysMs: number } | undefined => {
  const user = [...stderr.matchAll(/^user\s+([\d.]+)\s*$/gm)].at(-1)
  const sys = [...stderr.matchAll(/^sys\s+([\d.]+)\s*$/gm)].at(-1)
  if (!user || !sys) return undefined
  return {
    userMs: Math.round(Number(user[1]) * 1000),
    sysMs: Math.round(Number(sys[1]) * 1000),
  }
}

/** A readable name for a process: the binary, plus the script it runs. */
export const shortCommand = (args: string): string => {
  const [first = '', second] = args.replace(/^\((.*)\)$/, '$1').split(/\s+/)
  const binary = basename(first)
  const name =
    /^(node|nodejs|bun)$/.test(binary) && second && !second.startsWith('-')
      ? `${binary} ${basename(second)}`
      : binary
  return name.length > 48 ? `${name.slice(0, 47)}…` : name
}

export type CliInvocation = { command: string; args: string[] }

/**
 * How to start this same CLI again. A `bun build --compile` binary embeds its
 * script under a virtual `$bunfs` (`B:/~BUN` on Windows) root, and its
 * `execPath` is the pikku binary itself, so it is started directly. Otherwise
 * the runtime runs the CLI's own bin, resolved relative to this module.
 */
export const resolveCliInvocation = ({
  execPath,
  execArgv,
  moduleUrl,
  argv1,
  exists,
}: {
  execPath: string
  execArgv: string[]
  moduleUrl: string
  argv1: string | undefined
  exists: (path: string) => boolean
}): CliInvocation => {
  if (moduleUrl.includes('$bunfs') || moduleUrl.includes('~BUN')) {
    return { command: execPath, args: [] }
  }
  const bin = fileURLToPath(new URL('../../../bin/pikku.js', moduleUrl))
  const script = exists(bin) ? bin : argv1
  return { command: execPath, args: script ? [...execArgv, script] : [] }
}

export const currentCliInvocation = (): CliInvocation =>
  resolveCliInvocation({
    execPath: process.execPath,
    execArgv: process.execArgv,
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    exists: existsSync,
  })

const run = (command: string, args: string[]): Promise<string> =>
  new Promise((resolve) => {
    execFile(command, args, { maxBuffer: 64 * 1024 * 1024 }, (_error, stdout) =>
      resolve(String(stdout ?? ''))
    )
  })

const linuxPeakRss = (pid: number): number => {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8')
    const hwm = /^VmHWM:\s*(\d+)\s*kB/m.exec(status)
    return hwm ? Number(hwm[1]) * 1024 : 0
  } catch {
    return 0
  }
}

const TIME_BIN = '/usr/bin/time'

export type MeasureOptions = {
  engine: ComparisonEngine
  run: number
  cwd: string
  cli: CliInvocation
  extraArgs: string[]
  sampleIntervalMs?: number
  onSpawn?: (child: ChildProcess) => void
}

export type MeasuredRun = RunMeasurement & { stdout: string; stderr: string }

/**
 * Runs `pikku all --inspector <engine>` as a child process and samples its
 * whole process tree until it exits.
 */
export const measureRun = async ({
  engine,
  run: runNumber,
  cwd,
  cli,
  extraArgs,
  sampleIntervalMs = 100,
  onSpawn,
}: MeasureOptions): Promise<MeasuredRun> => {
  const pikkuArgs = [...cli.args, 'all', '--inspector', engine, ...extraArgs]
  const useTime = process.platform !== 'win32' && existsSync(TIME_BIN)
  const [command, args] = useTime
    ? [TIME_BIN, ['-p', cli.command, ...pikkuArgs]]
    : [cli.command, pikkuArgs]

  const started = performance.now()
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PIKKU_NO_LOGO: '1' },
  })
  onSpawn?.(child)
  let stdout = ''
  let stderr = ''
  child.stdout!.on('data', (chunk) => (stdout += chunk))
  child.stderr!.on('data', (chunk) => (stderr += chunk))

  let exited = false
  const exit = new Promise<{ code: number; wallMs: number }>(
    (resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => {
        exited = true
        resolve({
          code: code ?? (signal ? 128 : 1),
          wallMs: performance.now() - started,
        })
      })
    }
  )

  const peaks = new Map<number, ProcessPeak>()
  const cpuByPid = new Map<number, number>()
  let peakTotalRss = 0
  let peakTotalFootprint: number | undefined
  let treePids: number[] = []
  const rootPid = child.pid!

  const sampleTree = async (): Promise<void> => {
    // The `time` wrapper is not part of what is being measured.
    const rows = processTree(
      parsePsOutput(
        await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,time=,args='])
      ),
      rootPid
    ).filter((r) => !(useTime && r.pid === rootPid))
    if (exited || rows.length === 0) return
    treePids = rows.map((r) => r.pid)
    let total = 0
    for (const row of rows) {
      total += row.rssBytes
      cpuByPid.set(row.pid, row.cpuMs)
      const rss = Math.max(
        row.rssBytes,
        process.platform === 'linux' ? linuxPeakRss(row.pid) : 0
      )
      const peak = peaks.get(row.pid)
      if (!peak) {
        peaks.set(row.pid, {
          pid: row.pid,
          command: shortCommand(row.args),
          peakRssBytes: rss,
        })
      } else {
        peak.peakRssBytes = Math.max(peak.peakRssBytes, rss)
        // A process between fork and exec still shows its parent's args, and
        // one that is exiting shows only `(name)`, so the latest full args win.
        if (!/^\(.*\)$/.test(row.args)) peak.command = shortCommand(row.args)
      }
    }
    peakTotalRss = Math.max(peakTotalRss, total)
  }

  const sampleFootprint = async (): Promise<void> => {
    const pids = treePids
    if (pids.length === 0) return
    const footprints = parseFootprintOutput(
      await run('footprint', [
        '--noCategories',
        '-f',
        'bytes',
        ...pids.map(String),
      ])
    )
    if (footprints.size === 0) return
    let total = 0
    for (const [pid, { footprintBytes, peakBytes }] of footprints) {
      total += footprintBytes
      const peak = peaks.get(pid)
      if (peak) {
        peak.peakFootprintBytes = Math.max(
          peak.peakFootprintBytes ?? 0,
          peakBytes
        )
      }
    }
    peakTotalFootprint = Math.max(peakTotalFootprint ?? 0, total)
  }

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const loop = async (sample: () => Promise<void>) => {
    while (!exited) {
      const tick = performance.now()
      await sample().catch(() => undefined)
      await delay(Math.max(0, sampleIntervalMs - (performance.now() - tick)))
    }
  }
  const footprintAvailable =
    process.platform === 'darwin' && existsSync('/usr/bin/footprint')
  await Promise.all([
    exit,
    loop(sampleTree),
    footprintAvailable ? loop(sampleFootprint) : undefined,
  ])
  const { code, wallMs } = await exit

  const processes = [...peaks.values()]
  const byRss = [...processes].sort((a, b) => b.peakRssBytes - a.peakRssBytes)
  const byFootprint = processes
    .filter((p) => p.peakFootprintBytes !== undefined)
    .sort((a, b) => b.peakFootprintBytes! - a.peakFootprintBytes!)

  const rusage = useTime ? parseTimeReport(stderr) : undefined
  const sampledCpu = [...cpuByPid.values()].reduce((a, b) => a + b, 0)

  return {
    engine,
    run: runNumber,
    exitCode: code,
    wallMs,
    cpuUserMs: rusage?.userMs ?? sampledCpu,
    cpuSysMs: rusage?.sysMs ?? 0,
    cpuSource: rusage ? 'rusage' : 'sampled',
    peakProcessRssBytes: byRss[0]?.peakRssBytes ?? 0,
    peakProcessRssCommand: byRss[0]?.command ?? '',
    peakTotalRssBytes: Math.max(peakTotalRss, byRss[0]?.peakRssBytes ?? 0),
    peakProcessFootprintBytes: byFootprint[0]?.peakFootprintBytes,
    peakProcessFootprintCommand: byFootprint[0]?.command,
    // A process's own peak comes from the kernel and can exceed any sum of
    // sampled current values.
    peakTotalFootprintBytes:
      peakTotalFootprint === undefined
        ? undefined
        : Math.max(peakTotalFootprint, byFootprint[0]?.peakFootprintBytes ?? 0),
    processes: byRss,
    stdout,
    stderr,
  }
}
