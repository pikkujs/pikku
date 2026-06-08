import { execSync } from 'child_process'
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

const PROJECT_DIR = resolve(os.tmpdir(), 'pikku-cli-bench')

const SIZES = [10, 50, 100, 250, 500, 1000]
const RUNS_PER_SIZE = 3

function setupProject() {
  mkdirSync(resolve(PROJECT_DIR, 'src/functions'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'src/wirings'), { recursive: true })
  mkdirSync(resolve(PROJECT_DIR, 'types'), { recursive: true })

  const nmLink = resolve(PROJECT_DIR, 'node_modules')
  if (!existsSync(nmLink)) {
    symlinkSync(PIKKU_NODE_MODULES, nmLink)
  }

  writeFileSync(
    resolve(PROJECT_DIR, 'package.json'),
    JSON.stringify({ name: 'pikku-cli-bench', version: '0.0.1', type: 'module' }, null, 2)
  )

  writeFileSync(
    resolve(PROJECT_DIR, 'pikku.config.json'),
    JSON.stringify({
      $schema:
        'https://raw.githubusercontent.com/pikkujs/pikku/refs/heads/main/packages/cli/cli.schema.json',
      srcDirectories: ['./src', './types'],
      outDir: './.pikku',
      tsconfig: './tsconfig.json',
    }, null, 2)
  )

  writeFileSync(
    resolve(PROJECT_DIR, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        allowImportingTsExtensions: true,
        noEmit: true,
      },
      include: ['src/**/*', 'types/**/*', '.pikku/**/*'],
    }, null, 2)
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

function functionFile(n: number): string {
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

function wiringFile(count: number): string {
  const imports = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    return `import { testFunc${pad} } from '../functions/test-func-${pad}.function.js'`
  })

  const routes = Array.from({ length: count }, (_, i) => {
    const pad = String(i + 1).padStart(4, '0')
    return `    r${pad}: { method: 'get', route: '/test/${pad}', func: testFunc${pad} },`
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

function writeSize(count: number) {
  const fnDir = resolve(PROJECT_DIR, 'src/functions')
  const wireDir = resolve(PROJECT_DIR, 'src/wirings')
  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(4, '0')
    writeFileSync(resolve(fnDir, `test-func-${pad}.function.ts`), functionFile(i))
  }
  writeFileSync(resolve(wireDir, 'bench.http.wirings.ts'), wiringFile(count))
}

function cleanSrc() {
  const fnDir = resolve(PROJECT_DIR, 'src/functions')
  const wireDir = resolve(PROJECT_DIR, 'src/wirings')
  rmSync(fnDir, { recursive: true, force: true })
  rmSync(wireDir, { recursive: true, force: true })
  mkdirSync(fnDir, { recursive: true })
  mkdirSync(wireDir, { recursive: true })
  // services.ts is kept (not in functions/ or wirings/)
}

function runAll(): number {
  const start = performance.now()
  execSync(`${PIKKU_BIN} all`, {
    cwd: PROJECT_DIR,
    stdio: 'pipe',
    timeout: 600_000,
  })
  return performance.now() - start
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
    console.error(`Build the pikku CLI first: cd ${SIBLING_PIKKU} && yarn build`)
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
  }> = []

  for (const size of SIZES) {
    process.stdout.write(`  ${String(size).padStart(4)} functions: `)
    writeSize(size)

    const times: number[] = []
    for (let r = 0; r < RUNS_PER_SIZE; r++) {
      times.push(runAll())
      process.stdout.write('.')
    }
    console.log(
      `  min=${Math.round(Math.min(...times))}ms  median=${Math.round(median(times))}ms  max=${Math.round(Math.max(...times))}ms`
    )

    cleanSrc()
    results.push({
      functions: size,
      minMs: Math.min(...times),
      medianMs: median(times),
      maxMs: Math.max(...times),
    })
  }

  console.log('\n')
  console.table(
    results.map((r) => ({
      functions: r.functions,
      'min (ms)': Math.round(r.minMs),
      'median (ms)': Math.round(r.medianMs),
      'max (ms)': Math.round(r.maxMs),
    }))
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
