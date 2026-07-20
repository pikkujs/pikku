import { spawnSync } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Derive paths from the worktree location:
//   benchmarks/  -> pikku-benchmarks/ -> pikku/ (sibling with node_modules)
const SIBLING_PIKKU = resolve(__dirname, '..', '..', 'pikku')
const PIKKU_BIN = resolve(SIBLING_PIKKU, 'node_modules/.bin/pikku')
const PIKKU_NODE_MODULES = resolve(SIBLING_PIKKU, 'node_modules')

// ── CLI args ──────────────────────────────────────────────────────────────────
//   --weight=light|heavy   fixture type closure (default: light)
//   --sizes=25,50,100      function counts to sweep
//   --runs=3               runs per size
//   --heap=6144            --max-old-space-size for the child; omit for Node's
//                          default, which is the whole point when hunting an OOM
function argOf(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

type Weight = 'light' | 'heavy'
const WEIGHT = (argOf('weight') ?? 'light') as Weight
if (WEIGHT !== 'light' && WEIGHT !== 'heavy') {
  console.error(`--weight must be light or heavy, got "${WEIGHT}"`)
  process.exit(1)
}

// Separate project dir per weight so the two fixtures never share a .pikku/ or
// a schema cache — a warm cache from the other weight would skew the numbers.
const PROJECT_DIR = resolve(os.tmpdir(), `pikku-cli-bench-${WEIGHT}`)

const SIZES = (argOf('sizes') ?? '10,50,100,250,500,1000')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
const RUNS_PER_SIZE = parseInt(argOf('runs') ?? '3', 10)
// Undefined => let Node pick its default old-space. bench-cli previously pinned
// 8192 here, which made the OOM this benchmark is meant to catch unobservable.
const HEAP_MB = argOf('heap') ? parseInt(argOf('heap')!, 10) : undefined
const KEEP = process.argv.includes('--keep')

function setupProject() {
  mkdirSync(resolve(PROJECT_DIR, 'src/functions'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'src/wirings'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'src/workflows'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'types'), { recursive: true })

  const nmLink = resolve(PROJECT_DIR, 'node_modules')
  if (!existsSync(nmLink)) {
    symlinkSync(PIKKU_NODE_MODULES, nmLink)
  }

  writeFileSync(
    resolve(PROJECT_DIR, 'package.json'),
    JSON.stringify(
      { name: 'pikku-cli-bench', version: '0.0.1', type: 'module' },
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
          target: 'ESNext',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          allowImportingTsExtensions: true,
          noEmit: true,
        },
        include: ['src/**/*', 'types/**/*', '.pikku/**/*'],
      },
      null,
      2
    )
  )

  // Project types — must use interface-extends-CoreXxx so the inspector finds them
  writeFileSync(
    resolve(PROJECT_DIR, 'types/application-types.ts'),
    [
      `import type { CoreUserSession, CoreSingletonServices, CoreServices, CoreConfig } from '@pikku/core'`,
      ``,
      `export interface UserSession extends CoreUserSession { userId: string }`,
      `export interface SingletonServices extends CoreSingletonServices {}`,
      `export interface Services extends CoreServices {}`,
      `export interface Config extends CoreConfig {}`,
    ].join('\n')
  )

  if (WEIGHT === 'heavy') {
    writeFileSync(resolve(PROJECT_DIR, 'types/db-schema.ts'), dbSchemaFile())
    writeFileSync(
      resolve(PROJECT_DIR, 'types/deep-generic.ts'),
      deepGenericFile()
    )
  }

  // Factory stubs — defined inline to avoid .pikku/ chicken-and-egg at bootstrap
  writeFileSync(
    resolve(PROJECT_DIR, 'src/services.ts'),
    [
      `const pikkuConfig = (fn: any) => fn`,
      `const pikkuServices = (fn: any) => fn`,
      `const pikkuWireServices = (fn: any) => fn`,
      ``,
      `export const createConfig = pikkuConfig(async () => ({}))`,
      `export const createSingletonServices = pikkuServices(async () => ({}))`,
      `export const createWireServices = pikkuWireServices(async () => ({}))`,
    ].join('\n')
  )
}

// ── heavy fixture: external type closure ─────────────────────────────────────
// The light fixture's zod schemas are self-contained — nothing forces the
// typechecker to pull in a large .d.ts closure, which is why the light sweep
// never reproduces the >2GB peak seen on real backends. These two files give
// the heavy fixture a genuinely expensive closure to resolve.

const DB_TABLES = 40
const DB_COLUMNS = 15

/** Kysely-generated-style schema: 40 tables x 15 branded columns. */
function dbSchemaFile(): string {
  const tables = Array.from({ length: DB_TABLES }, (_, t) => {
    const cols = Array.from({ length: DB_COLUMNS }, (_, c) => {
      // Rotate through Kysely's branded column types so each column forces a
      // distinct ColumnType instantiation rather than a cached identical one.
      const variants = [
        `Generated<number>`,
        `ColumnType<Date, string | Date, string | Date>`,
        `string | null`,
        `ColumnType<string, string, never>`,
        `Generated<boolean>`,
      ]
      return `  col${c}: ${variants[c % variants.length]}`
    }).join('\n')
    return `export interface Table${t} {\n${cols}\n}`
  }).join('\n\n')

  const dbFields = Array.from(
    { length: DB_TABLES },
    (_, t) => `  table${t}: Table${t}`
  ).join('\n')

  return `import type { Generated, ColumnType, Selectable, Insertable, Updateable } from 'kysely'

${tables}

export interface DB {
${dbFields}
}

export type Row<T extends keyof DB> = Selectable<DB[T]>
export type New<T extends keyof DB> = Insertable<DB[T]>
export type Patch<T extends keyof DB> = Updateable<DB[T]>
`
}

/** @octokit-style deeply nested conditional + mapped generic. */
function deepGenericFile(): string {
  return `export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export type Paths<T, D extends number = 4> = D extends 0
  ? never
  : T extends object
    ? { [K in keyof T]-?: K extends string ? K | \`\${K}.\${Paths<T[K], Prev[D]>}\` : never }[keyof T]
    : never

type Prev = [never, 0, 1, 2, 3, 4]

export type Endpoints<T> = {
  [K in keyof T as \`GET /\${string & K}\`]: {
    parameters: DeepPartial<T[K]>
    response: { data: T[K][]; meta: { total: number; cursor: string | null } }
  }
}

export type Unwrap<T> = T extends { response: { data: (infer U)[] } } ? U : never

export type Resolved<T, K extends keyof Endpoints<T>> = Unwrap<Endpoints<T>[K]>
`
}

/** Heavy function: generic-based (never generics + input/output together). */
function heavyFunctionFile(n: number): string {
  const name = `testFunc${String(n).padStart(4, '0')}`
  const table = `table${n % DB_TABLES}`

  // Alternate the two expensive codepaths: even n exercises the
  // ts-json-schema-generator path via TS generics over the Kysely + deep-generic
  // closure; odd n exercises the zod path with a 30+ field inferred object.
  if (n % 2 === 0) {
    return `import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import type { Row, New, DB } from '../../types/db-schema.js'
import type { Endpoints, Resolved, DeepPartial, Paths } from '../../types/deep-generic.js'

export type ${name}In = {
  row: New<'${table}'>
  filter: DeepPartial<Row<'${table}'>>
  sort: Paths<Row<'${table}'>>
  page: { limit: number; cursor: string | null }
}

export type ${name}Out = {
  item: Row<'${table}'>
  related: Resolved<Pick<DB, '${table}'>, 'GET /${table}'>
  endpoints: keyof Endpoints<Pick<DB, '${table}'>>
  meta: { total: number; cursor: string | null; durationMs: number }
}

export const ${name} = pikkuSessionlessFunc<${name}In, ${name}Out>({
  func: async (_services, data) => ({
    item: data.row as unknown as Row<'${table}'>,
    related: null as unknown as Resolved<Pick<DB, '${table}'>, 'GET /${table}'>,
    endpoints: 'GET /${table}' as keyof Endpoints<Pick<DB, '${table}'>>,
    meta: { total: 0, cursor: data.page.cursor, durationMs: 0 },
  }),
})`
  }

  const wideFields = Array.from({ length: 35 }, (_, i) => {
    const variants = [
      `z.string()`,
      `z.number()`,
      `z.boolean()`,
      `z.array(z.string())`,
      `z.object({ a: z.string(), b: z.number() })`,
    ]
    return `  f${i}: ${variants[i % variants.length]},`
  }).join('\n')

  const wideReturn = Array.from({ length: 35 }, (_, i) => {
    const vals = [`''`, `0`, `false`, `[]`, `{ a: '', b: 0 }`]
    return `    f${i}: ${vals[i % vals.length]},`
  }).join('\n')

  return `import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { z } from 'zod'

export const ${name}Input = z.object({
${wideFields}
})

export const ${name}Output = z.object({
${wideFields}
})

export const ${name} = pikkuSessionlessFunc({
  input: ${name}Input,
  output: ${name}Output,
  func: async (_services, _data) => ({
${wideReturn}
  }),
})`
}

function functionFile(n: number): string {
  if (WEIGHT === 'heavy') return heavyFunctionFile(n)
  const name = `testFunc${String(n).padStart(4, '0')}`
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

// n-th workflow references functions at indices n, n+1, n+2 (wrapping within count)
function wrap(n: number, count: number): string {
  return String(((n - 1) % count) + 1).padStart(4, '0')
}

function workflowFile(n: number, count: number): string {
  const name = `benchWorkflow${String(n).padStart(4, '0')}`
  const graphName = `benchGraph${String(n).padStart(4, '0')}`
  // Graph nodes reference 5 functions spread across the function set
  const nodes = [0, 1, 2, 3, 4].map((offset) => wrap(n + offset, count))

  return `import { pikkuWorkflowComplexFunc, pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { z } from 'zod'

export const ${name}Input = z.object({
  id: z.string(),
  name: z.string(),
  trigger: z.enum(['manual', 'scheduled', 'event']),
  priority: z.number(),
  context: z.object({
    userId: z.string(),
    orgId: z.string(),
    region: z.string(),
  }),
  options: z.object({
    retries: z.number(),
    timeout: z.number(),
    notify: z.boolean(),
  }),
  tags: z.array(z.string()),
  dryRun: z.boolean().optional(),
})

export const ${name}Output = z.object({
  workflowId: z.string(),
  status: z.enum(['completed', 'failed', 'partial']),
  steps: z.array(z.object({
    name: z.string(),
    duration: z.number(),
    result: z.string(),
  })),
  summary: z.object({
    totalSteps: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
  }),
  startedAt: z.string(),
  completedAt: z.string(),
  triggeredBy: z.string(),
  version: z.string(),
  retryCount: z.number(),
})

export const ${name} = pikkuWorkflowComplexFunc({
  input: ${name}Input,
  output: ${name}Output,
  func: async (_services, data, { workflow }) => {
    const r1 = await workflow.do('Step 1', async () => ({ id: data.id, val: \`s1-\${data.name}\`, score: 10 }))
    const r2 = await workflow.do('Step 2', async () => ({ id: r1.id, val: \`s2-\${r1.val}\`, score: 20 }))
    const r3 = await workflow.do('Step 3', async () => ({ id: r2.id, val: \`s3-\${r2.val}\`, score: 30 }))
    const r4 = await workflow.do('Step 4', async () => ({ id: r3.id, val: \`s4-\${r3.val}\`, score: 40 }))
    const r5 = await workflow.do('Step 5', async () => ({ id: r4.id, val: \`s5-\${r4.val}\`, score: 50 }))
    const now = new Date().toISOString()
    return {
      workflowId: data.id,
      status: 'completed' as const,
      steps: [
        { name: 'Step 1', duration: r1.score, result: r1.val },
        { name: 'Step 2', duration: r2.score, result: r2.val },
        { name: 'Step 3', duration: r3.score, result: r3.val },
        { name: 'Step 4', duration: r4.score, result: r4.val },
        { name: 'Step 5', duration: r5.score, result: r5.val },
      ],
      summary: { totalSteps: 5, successCount: 5, failureCount: 0 },
      startedAt: now,
      completedAt: now,
      triggeredBy: data.trigger,
      version: '1',
      retryCount: 0,
    }
  },
})

const benchInput = () => ({
  id: '1', name: 'bench', age: 25, email: 'a@b.com', isActive: true,
  role: 'user' as const,
  address: { street: '1 Main St', city: 'Bench City', country: 'US' },
  tags: ['bench'], metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01' },
})

export const ${graphName} = pikkuWorkflowGraph({
  description: 'Benchmark graph ${n} — 5-node linear chain',
  nodes: {
    init:      'testFunc${nodes[0]}',
    validate:  'testFunc${nodes[1]}',
    transform: 'testFunc${nodes[2]}',
    enrich:    'testFunc${nodes[3]}',
    finalize:  'testFunc${nodes[4]}',
  } as any,
  config: {
    init:      { input: benchInput, next: 'validate' },
    validate:  { input: benchInput, next: 'transform' },
    transform: { input: benchInput, next: 'enrich' },
    enrich:    { input: benchInput, next: 'finalize' },
    finalize:  { input: benchInput },
  } as any,
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
    `import { wireHTTPRoutes, defineHTTPRoutes } from '../../.pikku/pikku-types.gen.js'`,
    ...imports,
    ``,
    `wireHTTPRoutes([`,
    `  defineHTTPRoutes({`,
    `    auth: false,`,
    `    routes: {`,
    ...routes,
    `    },`,
    `  }),`,
    `])`,
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

function writeSize(count: number) {
  const fnDir = resolve(PROJECT_DIR, 'src/functions')
  const wireDir = resolve(PROJECT_DIR, 'src/wirings')
  const wfDir = resolve(PROJECT_DIR, 'src/workflows')
  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(4, '0')
    writeFileSync(
      resolve(fnDir, `test-func-${pad}.function.ts`),
      functionFile(i)
    )
    writeFileSync(
      resolve(wfDir, `bench-workflow-${pad}.ts`),
      workflowFile(i, count)
    )
  }
  writeFileSync(
    resolve(wireDir, 'bench.http.wirings.ts'),
    httpWiringFile(count)
  )
  writeFileSync(
    resolve(wireDir, 'bench.queue.wirings.ts'),
    queueWiringFile(count)
  )
  writeFileSync(
    resolve(wireDir, 'bench.scheduler.wirings.ts'),
    schedulerWiringFile(count)
  )
}

function cleanSrc() {
  const fnDir = resolve(PROJECT_DIR, 'src/functions')
  const wireDir = resolve(PROJECT_DIR, 'src/wirings')
  const wfDir = resolve(PROJECT_DIR, 'src/workflows')
  rmSync(fnDir, { recursive: true, force: true })
  rmSync(wireDir, { recursive: true, force: true })
  rmSync(wfDir, { recursive: true, force: true })
  mkdirSync(fnDir, { recursive: true })
  mkdirSync(wireDir, { recursive: true })
  mkdirSync(wfDir, { recursive: true })
  // services.ts is kept (not in functions/ or wirings/)
}

function runAll(): { ms: number; peakMB: number; oom: boolean } {
  const start = performance.now()
  const result = spawnSync('/usr/bin/time', ['-l', PIKKU_BIN, 'all'], {
    cwd: PROJECT_DIR,
    timeout: 600_000,
    env: {
      ...process.env,
      ...(HEAP_MB
        ? { NODE_OPTIONS: `--max-old-space-size=${HEAP_MB}` }
        : // Strip any inherited NODE_OPTIONS so the child really does run on
          // Node's default old-space — that ceiling is what we're measuring.
          { NODE_OPTIONS: '' }),
    },
  })
  const ms = performance.now() - start
  // /usr/bin/time -l writes "NNN  maximum resident set size" to stderr (bytes on macOS)
  const stderr = result.stderr?.toString() ?? ''
  const match = stderr.match(/(\d+)\s+maximum resident set size/)
  const peakMB = match ? Math.round(parseInt(match[1]) / 1024 / 1024) : 0

  // An OOM is a data point here, not a benchmark failure — record it and keep
  // sweeping so we can see exactly which N crosses the ceiling.
  const oom =
    /JavaScript heap out of memory|FATAL ERROR:.*Allocation failed/.test(stderr)
  if (result.status !== 0 && !oom) {
    throw new Error(stderr || result.error?.message || 'pikku all failed')
  }
  return { ms, peakMB, oom }
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

async function main() {
  console.log(`Project dir: ${PROJECT_DIR}`)
  console.log(`Pikku bin:   ${PIKKU_BIN}\n`)

  if (!existsSync(PIKKU_BIN)) {
    console.error(`pikku binary not found at ${PIKKU_BIN}`)
    console.error(
      `Build the pikku CLI first: cd ${SIBLING_PIKKU} && yarn build`
    )
    process.exit(1)
  }

  setupProject()

  if (!existsSync(resolve(PROJECT_DIR, '.pikku'))) {
    process.stdout.write('Bootstrapping .pikku/ (first run, untimed)... ')
    runAll()
    console.log('done\n')
  }

  console.log(`pikku all codegen scaling — ${RUNS_PER_SIZE} runs per size\n`)

  const results: Array<{
    functions: number
    minMs: number
    medianMs: number
    maxMs: number
    peakMB: number
    oomCount: number
  }> = []

  for (const size of SIZES) {
    process.stdout.write(`  ${String(size).padStart(4)} functions: `)
    writeSize(size)

    const times: number[] = []
    const heaps: number[] = []
    let oomCount = 0
    for (let r = 0; r < RUNS_PER_SIZE; r++) {
      const { ms, peakMB, oom } = runAll()
      times.push(ms)
      heaps.push(peakMB)
      if (oom) oomCount++
      process.stdout.write(oom ? 'X' : '.')
    }
    console.log(
      `  min=${Math.round(Math.min(...times))}ms  median=${Math.round(median(times))}ms  max=${Math.round(Math.max(...times))}ms  peak=${Math.max(...heaps)}MB` +
        (oomCount ? `  OOM=${oomCount}/${RUNS_PER_SIZE}` : '')
    )

    // --keep leaves the last size's fixture on disk so it can be re-run by
    // hand under a profiler (node --heap-prof / --inspect).
    if (!KEEP) cleanSrc()
    results.push({
      functions: size,
      minMs: Math.min(...times),
      medianMs: median(times),
      maxMs: Math.max(...times),
      peakMB: Math.max(...heaps),
      oomCount,
    })
  }

  console.log('\n')
  console.table(
    results.map((r) => ({
      functions: r.functions,
      'min (ms)': Math.round(r.minMs),
      'median (ms)': Math.round(r.medianMs),
      'max (ms)': Math.round(r.maxMs),
      'peak RSS (MB)': r.peakMB,
      OOM: r.oomCount ? `${r.oomCount}/${RUNS_PER_SIZE}` : '',
    }))
  )

  // Slope between the smallest and largest completed size tells us which
  // hypothesis holds: a steep constant slope means genuine linear per-function
  // cost; a high intercept with a shallow slope means the fixed cost is the
  // program/typechecker, not the functions.
  const ok = results.filter((r) => r.oomCount === 0)
  if (ok.length >= 2) {
    const lo = ok[0]!
    const hi = ok[ok.length - 1]!
    const slope = (hi.peakMB - lo.peakMB) / (hi.functions - lo.functions)
    const intercept = lo.peakMB - slope * lo.functions
    console.log(
      `\nweight=${WEIGHT}  heap=${HEAP_MB ? `${HEAP_MB}MB` : 'node default'}`
    )
    console.log(
      `peak RSS ~= ${intercept.toFixed(0)}MB fixed + ${slope.toFixed(2)}MB/function ` +
        `(fit over N=${lo.functions}..${hi.functions})`
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
