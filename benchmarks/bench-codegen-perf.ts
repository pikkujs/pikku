/**
 * Codegen performance gate: generates 500 realistic functions + wires + an
 * agent, runs `pikku all`, and fails (exit 1) when it is too slow, does more
 * work than it should, or holds more memory than it should.
 *
 * Time is gated loosely (THRESHOLD_MS) because it swings ~2x with the runner.
 * The real gates are counts, which don't: files parsed, checker work and live
 * heap per inspector pass, read from the `[INSPECT]` rows `pikku all` prints
 * under PIKKU_TIMING and from the heap probe preloaded into the child.
 *
 * Usage:
 *   node --import tsx/esm benchmarks/bench-codegen-perf.ts
 *   # or via the CI job (see .github/workflows/develop.yml)
 */
import { spawnSync } from 'child_process'
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  readFileSync,
} from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))

const REPO_ROOT = resolve(__dirname, '..')
const PIKKU_BIN = resolve(REPO_ROOT, 'node_modules/.bin/pikku')
const PIKKU_NODE_MODULES = resolve(REPO_ROOT, 'node_modules')
const HEAP_PROBE = resolve(__dirname, 'codegen-heap-probe.cjs')

const PROJECT_DIR = resolve(os.tmpdir(), 'pikku-codegen-perf')
const FUNCTION_COUNT = 500
const THRESHOLD_MS = 30_000
// ── work gates ────────────────────────────────────────────────────────────────
// `pikku all` inspects three times on this fixture: a setup-only pass, the
// full pass, and a re-inspection after the agent wirings are generated (the
// bench deletes those before the measured run so the re-inspection always
// happens). Each is a ts.Program + type checker over the same ~900 files.
const EXPECTED_PASSES = 3
// A re-inspection must not do more checker work than the full pass it
// follows. It sees the same project plus a handful of generated files, so its
// type and instantiation counts sit within a few percent of the full pass; a
// re-inspect that resolves what the full pass already resolved — or resolves
// it differently — shows here before it shows in any timing.
const REINSPECT_WORK_MAX_RATIO = 1.1
// ...and must not pull in more files. Generated agent wirings account for a
// few; a re-inspect that starts walking node_modules or a second project
// accounts for hundreds.
const REINSPECT_EXTRA_FILES_MAX = 16

// ── memory gates ──────────────────────────────────────────────────────────────
// Live heap (after a forced GC) at the moment each inspector pass starts,
// from codegen-heap-probe.cjs. Only the current pass's program should be
// alive; if the previous pass's state pins its program — its `typesLookup`
// holds ts.Types, and a type reaches the checker and the whole program —
// every pass starts a full program + exercised checker higher than the one
// before, and a large project OOMs on a 2GB CI heap.
//
// The second pass is the sharp check: nothing but the setup pass has run, so
// it starts within a few MB of the first (~150MB) unless that pass's program
// is pinned (~+150MB).
const PASS2_LIVE_GROWTH_MAX_MB = 64
// By the re-inspection the full pass's state is legitimately alive — its meta,
// 500 schemas, the schema generator's cached program — so it starts ~140MB
// above the first pass. A pinned full-pass program and checker adds several
// hundred MB on top.
const REINSPECT_LIVE_GROWTH_MAX_MB = 256
// Everything alive at once, at the worst moment of the run — the number that
// actually hits the heap limit.
const PEAK_HEAP_MAX_MB = 660

// ── project scaffold ──────────────────────────────────────────────────────────

function setupProject() {
  mkdirSync(resolve(PROJECT_DIR, 'src/functions'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'src/wirings'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'src/agents'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'types'), { recursive: true })

  const nmLink = resolve(PROJECT_DIR, 'node_modules')
  if (!existsSync(nmLink)) symlinkSync(PIKKU_NODE_MODULES, nmLink)

  writeFileSync(
    resolve(PROJECT_DIR, 'package.json'),
    JSON.stringify(
      { name: 'pikku-codegen-perf', version: '0.0.1', type: 'module' },
      null,
      2
    )
  )

  writeFileSync(
    resolve(PROJECT_DIR, 'pikku.config.json'),
    JSON.stringify(
      {
        $schema:
          'https://raw.githubusercontent.com/pikkujs/pikku/refs/heads/main/packages/cli/cli.schema.json',
        srcDirectories: ['./src', './types'],
        outDir: './.pikku',
        tsconfig: './tsconfig.json',
      },
      null,
      2
    )
  )

  writeFileSync(
    resolve(PROJECT_DIR, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          outDir: './dist',
          allowImportingTsExtensions: true,
          noEmit: true,
        },
        include: ['src/**/*', 'types/**/*'],
      },
      null,
      2
    )
  )

  writeFileSync(
    resolve(PROJECT_DIR, 'types/application-types.ts'),
    `import type { CoreUserSession, CoreSingletonServices, CoreServices, CoreConfig } from '@pikku/core/types'
export interface UserSession extends CoreUserSession { userId: string }
export interface SingletonServices extends CoreSingletonServices {}
export interface Services extends CoreServices {}
export interface Config extends CoreConfig {}
`
  )

  writeFileSync(
    resolve(PROJECT_DIR, 'src/services.ts'),
    `const pikkuConfig = (fn: any) => fn
const pikkuServices = (fn: any) => fn
const pikkuWireServices = (fn: any) => fn
export const createConfig = pikkuConfig(async () => ({}))
export const createSingletonServices = pikkuServices(async () => ({}))
export const createWireServices = pikkuWireServices(async () => ({}))
`
  )
}

// ── file generators ───────────────────────────────────────────────────────────

function functionFile(n: number): string {
  const pad = String(n).padStart(4, '0')
  const name = `testFunc${pad}`
  return `import { pikkuSessionlessFunc } from '../../.pikku/function/index.js'
import { z } from 'zod'

export const ${name}Input = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
  isActive: z.boolean(),
  role: z.enum(['admin', 'user', 'guest']),
  address: z.object({
    street: z.string(),
    city: z.string(),
    country: z.string(),
  }),
  tags: z.array(z.string()),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  score: z.number().optional(),
})

export const ${name}Output = z.object({
  result: z.string(),
  processedAt: z.string(),
  status: z.enum(['success', 'failure', 'pending']),
  data: z.object({
    id: z.string(),
    name: z.string(),
    transformedScore: z.number(),
  }),
  warnings: z.array(z.string()),
  metadata: z.object({
    duration: z.number(),
    version: z.string(),
  }),
  total: z.number(),
  page: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
})

export const ${name} = pikkuSessionlessFunc({
  input: ${name}Input,
  output: ${name}Output,
  func: async (_services, data) => ({
    result: data.name,
    processedAt: new Date().toISOString(),
    status: 'success' as const,
    data: { id: data.id, name: data.name, transformedScore: data.score ?? 0 },
    warnings: [],
    metadata: { duration: 0, version: '1' },
    total: 1,
    page: 1,
    hasMore: false,
  }),
})`
}

/**
 * One agent, so `pikku all` generates agent wirings and re-inspects after
 * them — the pass the memory and work gates are about. Its tools are the
 * first two fixture functions; a provider-qualified model needs no alias.
 */
function agentFile(): string {
  return `import { pikkuAgent } from '../../.pikku/agent/pikku-agent-types.gen.js'
import { ref } from '../../.pikku/function/index.js'

export const benchAgent = pikkuAgent({
  name: 'bench-agent',
  description: 'Exercises the post-agent re-inspection in the codegen benchmark',
  goal: 'Call the test functions.',
  model: 'openai/gpt-4',
  tools: [ref('testFunc0001'), ref('testFunc0002')],
  maxSteps: 3,
})
`
}

function httpWiringFile(count: number): string {
  const imports = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    return `import { testFunc${pad} } from '../functions/test-func-${pad}.function.js'`
  })
  const routes = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    return [
      `    r${pad}List:   { method: 'get',    route: '/test/${pad}',     func: testFunc${pad} },`,
      `    r${pad}Create: { method: 'post',   route: '/test/${pad}',     func: testFunc${pad} },`,
      `    r${pad}Get:    { method: 'get',    route: '/test/${pad}/:id', func: testFunc${pad} },`,
      `    r${pad}Update: { method: 'put',    route: '/test/${pad}/:id', func: testFunc${pad} },`,
      `    r${pad}Delete: { method: 'delete', route: '/test/${pad}/:id', func: testFunc${pad} },`,
    ].join('\n')
  })
  return [
    `import { defineHTTPRoutes } from '../../.pikku/http/index.js'`,
    ...imports,
    ``,
    `defineHTTPRoutes({`,
    ...routes,
    `})`,
  ].join('\n')
}

function queueWiringFile(count: number): string {
  const imports = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    return `import { testFunc${pad} } from '../functions/test-func-${pad}.function.js'`
  })
  const wires = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    return `wireQueueWorker({ name: 'queue-${pad}', func: testFunc${pad} })`
  })
  return [
    `import { wireQueueWorker } from '../../.pikku/queue/index.js'`,
    ...imports,
    ``,
    ...wires,
  ].join('\n')
}

function schedulerWiringFile(count: number): string {
  const imports = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    return `import { testFunc${pad} } from '../functions/test-func-${pad}.function.js'`
  })
  const wires = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    const minute = (i % 60).toString().padStart(2, '0')
    const hour = Math.floor(i / 60) % 24
    return `wireScheduler({ name: 'schedule-${pad}', schedule: '${minute} ${hour} * * *', func: testFunc${pad} })`
  })
  return [
    `import { wireScheduler } from '../../.pikku/scheduler/index.js'`,
    ...imports,
    ``,
    ...wires,
  ].join('\n')
}

// ── runner ────────────────────────────────────────────────────────────────────

// pikku persists generated TS schemas under node_modules/.cache/pikku across
// runs. This benchmark measures *cold* codegen (the worst case the threshold
// and structural gate are about), so clear that cache before every run —
// otherwise a warm run skips schema generation, shrinking the initial pass and
// inflating the re-inspect ratio.
function clearSchemaCache(): void {
  rmSync(resolve(PROJECT_DIR, 'node_modules', '.cache', 'pikku'), {
    recursive: true,
    force: true,
  })
}

type HeapProgram = {
  index: number
  kind: 'inspector' | 'schema' | 'other'
  caller: string
  atMs: number
  liveMb: number
}
type HeapReport = { programs: HeapProgram[]; peakMb: number }

/** One `[INSPECT]` row: what an inspector pass did and cost. */
type InspectorPass = {
  pass: number
  kind: 'setup' | 'full'
  files: number
  project: number
  reused: number
  types: number
  instantiations: number
  symbols: number
  cpuMs: number
  wallMs: number
  heapMb: number
}

/**
 * The agent wirings `pikku all` generates. Removing them before a run makes
 * the agent stage write them again, which is what triggers the re-inspection
 * — otherwise only the first run on a fresh project would have one.
 */
function forceReinspect() {
  for (const name of [
    'pikku-agent-wirings.gen.ts',
    'pikku-agent-wirings-meta.gen.ts',
    'pikku-agent-wirings-meta.gen.json',
  ]) {
    rmSync(resolve(PROJECT_DIR, '.pikku/agent', name), { force: true })
  }
}

function runAll(opts: { measure?: boolean } = {}): {
  ms: number
  stdout: string
  heap?: HeapReport
} {
  clearSchemaCache()
  if (opts.measure) forceReinspect()
  const probeOut = resolve(PROJECT_DIR, 'heap-probe.json')
  rmSync(probeOut, { force: true })
  const start = performance.now()
  // No `--max-old-space-size` override: the child gets Node's default heap,
  // like the CI jobs that run `pikku all`, so a memory regression fails here
  // before it fails there.
  const result = spawnSync(PIKKU_BIN, ['all'], {
    cwd: PROJECT_DIR,
    timeout: 300_000,
    env: {
      ...process.env,
      ...(opts.measure
        ? {
            NODE_OPTIONS: `--expose-gc --require ${HEAP_PROBE}`,
            PIKKU_HEAP_PROBE_OUT: probeOut,
            PIKKU_TIMING: '1',
          }
        : { NODE_OPTIONS: '' }),
    },
  })
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString() ?? result.error?.message ?? 'pikku all failed'
    )
  }
  return {
    ms: performance.now() - start,
    stdout: result.stdout?.toString() ?? '',
    ...(opts.measure
      ? { heap: JSON.parse(readFileSync(probeOut, 'utf8')) as HeapReport }
      : {}),
  }
}

/**
 * Parse the per-pass rows `pikku all` prints under PIKKU_TIMING:
 * `[INSPECT] pass=2 full files=908 project=528 reused=0 types=40939 ...`
 */
function parseInspectorPasses(stdout: string): InspectorPass[] {
  const passes: InspectorPass[] = []
  for (const line of stdout.split('\n')) {
    const m = line.match(/\[INSPECT\]\s+pass=(\d+)\s+(setup|full)\s+(.*)$/)
    if (!m) continue
    const fields = Object.fromEntries(
      m[3].split(/\s+/).map((kv) => {
        const [k, v] = kv.split('=')
        return [k, parseInt(v, 10)]
      })
    )
    passes.push({
      pass: parseInt(m[1], 10),
      kind: m[2] as 'setup' | 'full',
      files: fields.files,
      project: fields.project,
      reused: fields.reused,
      types: fields.types,
      instantiations: fields.instantiations,
      symbols: fields.symbols,
      cpuMs: fields.cpu,
      wallMs: fields.wall,
      heapMb: fields.heap,
    })
  }
  return passes
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(PIKKU_BIN)) {
    console.error(
      `pikku binary not found at ${PIKKU_BIN} — run yarn build first`
    )
    process.exit(1)
  }

  rmSync(PROJECT_DIR, { recursive: true, force: true })
  setupProject()

  const fnDir = resolve(PROJECT_DIR, 'src/functions')
  const wireDir = resolve(PROJECT_DIR, 'src/wirings')

  for (let i = 1; i <= FUNCTION_COUNT; i++) {
    writeFileSync(
      resolve(fnDir, `test-func-${String(i).padStart(4, '0')}.function.ts`),
      functionFile(i)
    )
  }
  writeFileSync(resolve(PROJECT_DIR, 'src/agents/bench.agent.ts'), agentFile())
  writeFileSync(
    resolve(wireDir, 'bench.http.wirings.ts'),
    httpWiringFile(FUNCTION_COUNT)
  )
  writeFileSync(
    resolve(wireDir, 'bench.queue.wirings.ts'),
    queueWiringFile(FUNCTION_COUNT)
  )
  writeFileSync(
    resolve(wireDir, 'bench.scheduler.wirings.ts'),
    schedulerWiringFile(FUNCTION_COUNT)
  )

  // bootstrap .pikku/ (untimed)
  process.stdout.write(`Bootstrapping .pikku/ ... `)
  runAll()
  console.log('done')

  // timed run
  process.stdout.write(`Running pikku all on ${FUNCTION_COUNT} functions ... `)
  const { ms } = runAll()
  const rounded = Math.round(ms)
  console.log(`${rounded}ms`)

  let failed = false

  if (ms > THRESHOLD_MS) {
    console.error(`FAIL: ${rounded}ms exceeds ${THRESHOLD_MS}ms threshold`)
    failed = true
  } else {
    console.log(`PASS: ${rounded}ms <= ${THRESHOLD_MS}ms`)
  }

  // ── measured run ─────────────────────────────────────────────────────────
  // Its own run: the probe's forced GCs would inflate the timed one. Reports
  // one line per inspector pass — the `[INSPECT]` counts plus the live heap
  // the probe saw when that pass's program was created.
  process.stdout.write(`\nMeasuring inspector passes ... `)
  const measured = runAll({ measure: true })
  const heap = measured.heap!
  const passes = parseInspectorPasses(measured.stdout)
  const programs = heap.programs.filter((p) => p.kind === 'inspector')
  console.log(`${passes.length} passes, peak heap ${heap.peakMb}MB`)
  console.log(
    `  pass   kind   files  reused    types  instantiations   cpu(ms)  wall(ms)  live-at-start`
  )
  for (const p of passes) {
    const live = programs[p.pass - 1]?.liveMb
    console.log(
      `  ${String(p.pass).padStart(4)}  ${p.kind.padEnd(5)}  ` +
        `${String(p.files).padStart(5)}  ${String(p.reused).padStart(6)}  ` +
        `${String(p.types).padStart(7)}  ${String(p.instantiations).padStart(14)}  ` +
        `${String(p.cpuMs).padStart(8)}  ${String(p.wallMs).padStart(8)}  ` +
        `${live === undefined ? '?' : `${live}MB`}`
    )
  }
  for (const p of heap.programs.filter((p) => p.kind !== 'inspector')) {
    console.log(
      `  (+ ${p.kind} program at ${p.atMs}ms, ${p.liveMb}MB live: ${p.caller.replace(/\(.*\//, '(')})`
    )
  }

  const fail = (msg: string) => {
    console.error(`\nFAIL: ${msg}`)
    failed = true
  }
  const pass = (msg: string) => console.log(`\nPASS: ${msg}`)

  // ── work gates ───────────────────────────────────────────────────────────
  if (
    passes.length !== EXPECTED_PASSES ||
    programs.length !== EXPECTED_PASSES
  ) {
    fail(
      `expected ${EXPECTED_PASSES} inspector passes (setup, full, re-inspect ` +
        `after agents), saw ${passes.length} [INSPECT] rows and ` +
        `${programs.length} inspector programs`
    )
  } else {
    const [, full, reinspect] = passes
    const typesRatio = reinspect.types / full.types
    const instRatio = reinspect.instantiations / full.instantiations
    const extraFiles = reinspect.files - full.files
    if (
      typesRatio > REINSPECT_WORK_MAX_RATIO ||
      instRatio > REINSPECT_WORK_MAX_RATIO
    ) {
      fail(
        `re-inspection did ${(typesRatio * 100).toFixed(0)}% of the full pass's ` +
          `types and ${(instRatio * 100).toFixed(0)}% of its instantiations ` +
          `(> ${Math.round(REINSPECT_WORK_MAX_RATIO * 100)}%) — it is resolving more than ` +
          `the full pass did`
      )
    } else {
      pass(
        `re-inspection checker work is ${(typesRatio * 100).toFixed(0)}% types / ` +
          `${(instRatio * 100).toFixed(0)}% instantiations of the full pass ` +
          `(<= ${Math.round(REINSPECT_WORK_MAX_RATIO * 100)}%)`
      )
    }
    if (extraFiles > REINSPECT_EXTRA_FILES_MAX) {
      fail(
        `re-inspection parsed ${extraFiles} more files than the full pass ` +
          `(> ${REINSPECT_EXTRA_FILES_MAX})`
      )
    } else {
      pass(
        `re-inspection program has ${extraFiles} more files than the full pass ` +
          `(<= ${REINSPECT_EXTRA_FILES_MAX})`
      )
    }
    // Not gated yet: `releaseProgram` in services.ts drops the program the
    // next pass would reuse, so every pass re-parses everything (reused=0).
    // Reported so the fix is measurable when it lands; gate it then.
    console.log(
      `INFO: re-inspection reused ${reinspect.reused}/${reinspect.files} ` +
        `source files from the previous program`
    )
  }

  // ── memory gates ─────────────────────────────────────────────────────────
  const [first, second, ...later] = programs
  if (first && second) {
    const growth = second.liveMb - first.liveMb
    if (growth > PASS2_LIVE_GROWTH_MAX_MB) {
      fail(
        `pass 2 starts with ${second.liveMb}MB live, ${growth}MB above pass 1 ` +
          `(> ${PASS2_LIVE_GROWTH_MAX_MB}MB). The setup pass's state is keeping ` +
          `its ts.Program (and checker) alive — see the typesLookup release in ` +
          `services.ts.`
      )
    } else {
      pass(
        `pass 2 starts within ${growth}MB of pass 1 (<= ${PASS2_LIVE_GROWTH_MAX_MB}MB)`
      )
    }
    for (const p of later) {
      const growth = p.liveMb - first.liveMb
      if (growth > REINSPECT_LIVE_GROWTH_MAX_MB) {
        fail(
          `pass ${p.index} starts with ${p.liveMb}MB live, ${growth}MB above ` +
            `pass 1 (> ${REINSPECT_LIVE_GROWTH_MAX_MB}MB) — the full pass's ` +
            `program is still alive during the re-inspection`
        )
      } else {
        pass(
          `pass ${p.index} starts ${growth}MB above pass 1 (<= ${REINSPECT_LIVE_GROWTH_MAX_MB}MB)`
        )
      }
    }
  }

  if (heap.peakMb > PEAK_HEAP_MAX_MB) {
    fail(`peak heap ${heap.peakMb}MB exceeds ${PEAK_HEAP_MAX_MB}MB`)
  } else {
    pass(`peak heap ${heap.peakMb}MB <= ${PEAK_HEAP_MAX_MB}MB`)
  }

  if (failed) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
