import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectInput } from '../../inspector-go/src/test-project-input.ts'
import { toAnalysisOptions } from '../../inspector-go/src/protocol.ts'
import { withOpenAPIErrors } from '../../inspector-go/src/openapi-errors.ts'

export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..'
)
export const DEFAULT_OUT =
  '/tmp/claude-1000/-home-dev-pikku-pikku/477e9738-67aa-4b05-8fa0-8275aa107d70/scratchpad/parity'
export const DEFAULT_GO =
  '/home/dev/pikku/ts7-migration/packages/inspector-go/bin/pikku-inspect'
export const ROOTS = ['templates', 'recipes', 'verifiers']

export type Mode = 'inspect' | 'finalize'

/** Every directory under templates/, recipes/, verifiers/ holding a pikku.config.json. */
export const discoverProjects = (): string[] => {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        if (entry.name === 'pikku.config.json') found.push(dir)
        continue
      }
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name.startsWith('.')
      )
        continue
      walk(join(dir, entry.name))
    }
  }
  for (const root of ROOTS) {
    const dir = join(REPO_ROOT, root)
    if (existsSync(dir)) walk(dir)
  }
  return [...new Set(found)].sort()
}

/** Every tracked pikku.config.json in the repo (the full corpus: packages, e2e, ... as well as the 64). */
export const discoverTracked = (): string[] =>
  spawnSync('git', ['-C', REPO_ROOT, 'ls-files', '*pikku.config.json'], { encoding: 'utf8' })
    .stdout.split('\n')
    .filter((f) => f && (f === 'pikku.config.json' || f.endsWith('/pikku.config.json')))
    .map((f) => resolve(REPO_ROOT, dirname(f)))
    .sort()

export const projectName = (dir: string) => relative(REPO_ROOT, dir)

/** `--projects` takes comma-separated substrings or globs (`*` wildcard) matched on the repo-relative path. */
export const filterProjects = (all: string[], spec?: string): string[] => {
  if (!spec) return all
  const patterns = spec.split(',').map((p) => {
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(p.includes('*') ? `^${escaped}$` : escaped)
  })
  return all.filter((d) => patterns.some((re) => re.test(projectName(d))))
}

/** The Request `pikku all` would send (see inspector-go/src/inspect.ts). */
export const buildRequest = async (
  projectDir: string,
  withSchemas: boolean
): Promise<string> => {
  const input = await projectInput(projectDir)
  const options = { ...input.options }
  if (!withSchemas) delete options.schemaConfig
  const analysis = withOpenAPIErrors(toAnalysisOptions(options))
  return JSON.stringify({
    routeFiles: input.routeFiles,
    options: analysis,
  })
}

export const sha256 = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex')

const binHashes = new Map<string, string>()
export const binaryHash = (bin: string): string => {
  const real = resolve(bin)
  let hash = binHashes.get(real)
  if (!hash) {
    hash = sha256(readFileSync(real)).slice(0, 16)
    binHashes.set(real, hash)
  }
  return hash
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  wallMs: number
  peakRssKb: number | null
}

const TIME = '/usr/bin/time'

export const runBinary = (
  bin: string,
  args: string[],
  stdin: string,
  timeoutMs: number
): Promise<RunResult> =>
  new Promise((done) => {
    const timeFile = join(
      tmpdir(),
      `parity-time-${process.pid}-${Math.random().toString(36).slice(2)}`
    )
    const started = performance.now()
    const child = spawn(TIME, ['-f', '%M', '-o', timeFile, bin, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {}
    }, timeoutMs)
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
    child.on('error', (e) => {
      clearTimeout(timer)
      done({
        stdout: '',
        stderr: `spawn failed: ${e.message}`,
        exitCode: null,
        signal: null,
        timedOut,
        wallMs: 0,
        peakRssKb: null,
      })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      let peak: number | null = null
      let stderr = Buffer.concat(err).toString('utf8')
      if (existsSync(timeFile)) {
        // /usr/bin/time writes "Command exited with non-zero status N" before the %M line.
        const lines = readFileSync(timeFile, 'utf8').trim().split('\n')
        const last = Number(lines[lines.length - 1])
        if (Number.isFinite(last)) peak = last
        rmSync(timeFile, { force: true })
      }
      done({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr,
        exitCode: code,
        signal,
        timedOut,
        wallMs: Math.round(performance.now() - started),
        peakRssKb: peak,
      })
    })
  })

/** Run `items` through `fn`, at most `jobs` at a time, results in input order. */
export const pool = async <T, R>(
  items: T[],
  jobs: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.max(1, jobs) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i], i)
      }
    })
  )
  return results
}

/** Go outputs cached by (binary hash, mode, request hash). */
export const cachedRun = async (opts: {
  bin: string
  args: string[]
  stdin: string
  timeoutMs: number
  cacheDir?: string
}): Promise<RunResult & { cached: boolean }> => {
  const { bin, args, stdin, timeoutMs, cacheDir } = opts
  let file: string | undefined
  if (cacheDir) {
    mkdirSync(cacheDir, { recursive: true })
    file = join(
      cacheDir,
      `${binaryHash(bin)}-${sha256(args.join(' ') + '\0' + stdin).slice(0, 24)}.json`
    )
    if (existsSync(file))
      return { ...JSON.parse(readFileSync(file, 'utf8')), cached: true }
  }
  const result = await runBinary(bin, args, stdin, timeoutMs)
  if (file && !result.timedOut && result.exitCode !== null)
    writeFileSync(file, JSON.stringify(result))
  return { ...result, cached: false }
}

// ---------------------------------------------------------------- normalise

export const NORMALISATIONS = [
  'stats.{wallMs,cpuMs,heapUsedMb,types,instantiations,symbols} -> 0 (text-level, inside the top-level "stats" object only)',
  `absolute repo root ${REPO_ROOT} -> <REPO>`,
  'absolute temp paths (os.tmpdir() and /tmp/..., /var/folders/...) -> <TMP>',
  'stack-trace pointer/argument values (0x hex not preceded by +) inside diagnostic strings that carry a Go panic stack ("goroutine 1 [running]") -> 0xADDR',
] as const

export interface Normalised {
  text: string
  counts: Record<string, number>
}

const STAT_KEYS = [
  'wallMs',
  'cpuMs',
  'heapUsedMb',
  'types',
  'instantiations',
  'symbols',
]

export const normalise = (raw: string): Normalised => {
  const counts: Record<string, number> = {
    stats: 0,
    repoRoot: 0,
    tmpPaths: 0,
    goStackAddrs: 0,
  }
  let text = raw.replace(/"stats":\{[^{}]*\}/g, (block) =>
    block.replace(
      new RegExp(`"(${STAT_KEYS.join('|')})":-?[0-9][0-9.eE+-]*`, 'g'),
      (_m, key) => {
        counts.stats++
        return `"${key}":0`
      }
    )
  )
  text = text.split(REPO_ROOT).join('<REPO>')
  counts.repoRoot = raw.split(REPO_ROOT).length - 1
  const tmpRe = new RegExp(
    `(?:${tmpdir().replace(/[.+^${}()|[\]\\]/g, '\\$&')}|/tmp|/var/folders)/[^"\\s]*`,
    'g'
  )
  text = text.replace(tmpRe, () => {
    counts.tmpPaths++
    return '<TMP>'
  })
  text = text.replace(/"(?:[^"\\]|\\.)*"/g, (str) => {
    if (!str.includes('goroutine 1 [running]')) return str
    return str.replace(/(?<!\+)0x[0-9a-f]+/g, () => {
      counts.goStackAddrs++
      return '0xADDR'
    })
  })
  return { text, counts }
}

// --------------------------------------------------------------------- diff

export const firstByteDiff = (a: string, b: string) => {
  if (a === b) return null
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  const n = Math.min(ba.length, bb.length)
  let i = 0
  while (i < n && ba[i] === bb[i]) i++
  const ctx = (buf: Buffer) =>
    buf.subarray(Math.max(0, i - 60), i + 60).toString('utf8')
  return {
    offset: i,
    goLength: ba.length,
    rsLength: bb.length,
    goContext: ctx(ba),
    rsContext: ctx(bb),
  }
}

export interface LeafDiff {
  path: string
  go: unknown
  rs: unknown
}

const MISSING = '<missing>'
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const pointer = (base: string, key: string | number) =>
  `${base}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`

const clip = (v: unknown) => {
  const s = v === MISSING ? MISSING : JSON.stringify(v)
  return s !== undefined && s.length > 160 ? s.slice(0, 157) + '...' : s
}

export const leafDiffs = (
  go: unknown,
  rs: unknown,
  base: string,
  cap: number
): { count: number; first: LeafDiff[] } => {
  let count = 0
  const first: LeafDiff[] = []
  const record = (path: string, g: unknown, r: unknown) => {
    count++
    if (first.length < cap)
      first.push({ path, go: clip(g), rs: clip(r) } as LeafDiff)
  }
  const walk = (g: unknown, r: unknown, path: string) => {
    if (Array.isArray(g) && Array.isArray(r)) {
      const n = Math.max(g.length, r.length)
      for (let i = 0; i < n; i++) {
        if (i >= g.length) record(pointer(path, i), MISSING, r[i])
        else if (i >= r.length) record(pointer(path, i), g[i], MISSING)
        else walk(g[i], r[i], pointer(path, i))
      }
    } else if (isObj(g) && isObj(r)) {
      const keys = new Set([...Object.keys(g), ...Object.keys(r)])
      for (const k of keys) {
        if (!(k in r)) record(pointer(path, k), g[k], MISSING)
        else if (!(k in g)) record(pointer(path, k), MISSING, r[k])
        else walk(g[k], r[k], pointer(path, k))
      }
    } else if (g !== r) record(path, g, r)
  }
  walk(go, rs, base)
  return { count, first }
}

export type KeyStatus = 'identical' | 'different' | 'missing-in-rust' | 'extra-in-rust'

export interface KeyReport {
  status: KeyStatus
  leafDiffs: number
  orderOnly?: boolean
  first: LeafDiff[]
}

/**
 * Per top-level key: `state.<key>` for each key of state, plus every other
 * top-level key of the response (diagnostics, stats, finalized, ...). A key is
 * identical when its canonical, order-preserving serialisation is equal.
 */
export const structuralDiff = (
  goJson: any,
  rsJson: any,
  cap: number
): Record<string, KeyReport> => {
  const entries = (j: any): Map<string, unknown> => {
    const m = new Map<string, unknown>()
    for (const [k, v] of Object.entries(j ?? {})) {
      if (k === 'state' && isObj(v))
        for (const [sk, sv] of Object.entries(v)) m.set(`state.${sk}`, sv)
      else m.set(k, v)
    }
    return m
  }
  const g = entries(goJson)
  const r = entries(rsJson)
  const report: Record<string, KeyReport> = {}
  for (const key of [...new Set([...g.keys(), ...r.keys()])].sort()) {
    if (!r.has(key)) {
      report[key] = { status: 'missing-in-rust', leafDiffs: 1, first: [] }
    } else if (!g.has(key)) {
      report[key] = { status: 'extra-in-rust', leafDiffs: 1, first: [] }
    } else if (JSON.stringify(g.get(key)) === JSON.stringify(r.get(key))) {
      report[key] = { status: 'identical', leafDiffs: 0, first: [] }
    } else {
      const d = leafDiffs(g.get(key), r.get(key), '/' + key.replace('.', '/'), cap)
      report[key] = {
        status: 'different',
        leafDiffs: d.count,
        orderOnly: d.count === 0,
        first: d.first,
      }
    }
  }
  return report
}

export const parseJson = (text: string): any => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export const sh = (n: number) => (n / 1000).toFixed(1) + 's'
