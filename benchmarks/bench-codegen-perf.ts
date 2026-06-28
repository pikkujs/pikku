/**
 * Codegen performance gate: generates 500 realistic functions + wires, runs
 * `pikku all`, and fails (exit 1) if it takes longer than THRESHOLD_MS.
 *
 * Usage:
 *   node --import tsx/esm benchmarks/bench-codegen-perf.ts
 *   # or via the CI job (see .github/workflows/develop.yml)
 */
import { spawnSync } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))

const REPO_ROOT = resolve(__dirname, '..')
const PIKKU_BIN = resolve(REPO_ROOT, 'node_modules/.bin/pikku')
const PIKKU_NODE_MODULES = resolve(REPO_ROOT, 'node_modules')

const PROJECT_DIR = resolve(os.tmpdir(), 'pikku-codegen-perf')
const FUNCTION_COUNT = 500
const THRESHOLD_MS = 30_000
// Each post-codegen re-inspection must stay under this fraction of the initial
// inspection — guards against re-inspections re-walking all unchanged files.
const REINSPECT_MAX_RATIO = 0.5

// ── project scaffold ──────────────────────────────────────────────────────────

function setupProject() {
  mkdirSync(resolve(PROJECT_DIR, 'src/functions'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'src/wirings'), { recursive: true })
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
    `import type { CoreUserSession, CoreSingletonServices, CoreServices, CoreConfig } from '@pikku/core'
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
  return `import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
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
    `import { defineHTTPRoutes } from '../../.pikku/pikku-types.gen.js'`,
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
    `import { wireQueueWorker } from '../../.pikku/pikku-types.gen.js'`,
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
    `import { wireScheduler } from '../../.pikku/pikku-types.gen.js'`,
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

function runAll(timing = false): { ms: number; stdout: string } {
  clearSchemaCache()
  const start = performance.now()
  const result = spawnSync(PIKKU_BIN, ['all'], {
    cwd: PROJECT_DIR,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096',
      ...(timing ? { PIKKU_TIMING: '1' } : {}),
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
  }
}

/**
 * Parse the per-step timing table emitted by `pikku all` under PIKKU_TIMING.
 * Lines look like: `[TIMING]   1234ms  Re-inspect after workflows`
 */
function parseStepTimings(stdout: string): Map<string, number> {
  const steps = new Map<string, number>()
  for (const line of stdout.split('\n')) {
    const m = line.match(/\[TIMING\]\s+(\d+)ms\s+(.+?)\s*$/)
    if (m) steps.set(m[2], parseInt(m[1], 10))
  }
  return steps
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

  // ── structural gate ──────────────────────────────────────────────────────
  // A flat wall-clock ceiling can't catch "3x-redundant but still under budget"
  // work. `pikku all` runs the inspector once up-front, then re-inspects after
  // codegen produces new wirings. Those re-inspections should only need to pick
  // up the handful of generated files — NOT redo the full per-function type
  // resolution from the initial pass. Assert each re-inspect stays a small
  // fraction of the initial inspection so a regression to full re-walks fails.
  const steps = parseStepTimings(runAll(true).stdout)
  const initial = steps.get('Generate function types')
  const reinspects = [...steps.entries()].filter(([name]) =>
    name.startsWith('Re-inspect')
  )

  if (initial && reinspects.length > 0) {
    console.log(`\nInspector pass timings:`)
    console.log(`  ${String(initial).padStart(6)}ms  Generate function types (initial)`)
    for (const [name, dur] of reinspects) {
      console.log(`  ${String(dur).padStart(6)}ms  ${name}`)
    }

    const worst = reinspects.reduce((a, b) => (b[1] > a[1] ? b : a))
    const ratio = worst[1] / initial
    if (ratio > REINSPECT_MAX_RATIO) {
      console.error(
        `\nFAIL: re-inspection "${worst[0]}" took ${worst[1]}ms — ` +
          `${(ratio * 100).toFixed(0)}% of the ${initial}ms initial inspection ` +
          `(max ${REINSPECT_MAX_RATIO * 100}%). Re-inspections are re-walking ` +
          `unchanged files instead of only the generated ones.`
      )
      failed = true
    } else {
      console.log(
        `\nPASS: worst re-inspection "${worst[0]}" is ${(ratio * 100).toFixed(0)}% ` +
          `of initial (<= ${REINSPECT_MAX_RATIO * 100}%)`
      )
    }
  } else {
    console.warn(
      `\nWARN: could not find inspector pass timings — skipping structural gate`
    )
  }

  if (failed) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
