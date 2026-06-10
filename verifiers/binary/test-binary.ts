import { execFileSync, execSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VERIFIER_DIR = process.cwd()
const REPO_ROOT = join(VERIFIER_DIR, '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const BINARY_OUTPUT = join(VERIFIER_DIR, 'dist', 'fixture-binary')
const HOST_RELEASE_BINARY = join(
  REPO_ROOT,
  'packages',
  'cli',
  'release',
  'binaries',
  `pikku-${process.platform}-${process.arch}`
)

let failures = 0
const results: Array<{
  name: string
  status: 'passed' | 'failed' | 'skipped'
  error?: string
}> = []

async function check(
  name: string,
  fn: () => void | Promise<void>,
  options?: { skipIf?: () => string | null }
) {
  const skipReason = options?.skipIf?.()
  if (skipReason) {
    results.push({ name, status: 'skipped', error: skipReason })
    return
  }
  try {
    await fn()
    results.push({ name, status: 'passed' })
  } catch (e) {
    failures++
    results.push({ name, status: 'failed', error: (e as Error).message })
  }
}

function resolveStarterTemplateRoot(): string | null {
  const candidates = [
    process.env.PIKKU_STARTER_TEMPLATE,
    join(REPO_ROOT, '..', 'fabric', 'templates', 'starter-template'),
    join(REPO_ROOT, '..', '..', 'fabric', 'templates', 'starter-template'),
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function makeStarterWorkspace(): string {
  const starterRoot = resolveStarterTemplateRoot()
  if (!starterRoot) {
    throw new Error(
      'Starter template not found. Set PIKKU_STARTER_TEMPLATE or check out ../fabric/templates/starter-template.'
    )
  }

  const workspaceRoot = mkdtempSync(join(tmpdir(), 'pikku-binary-starter-'))
  cpSync(starterRoot, workspaceRoot, {
    recursive: true,
    filter: (src) => {
      const excluded = new Set([
        'node_modules',
        '.pikku',
        '.deploy',
        'dist',
        'coverage',
      ])
      for (const part of src.split('/')) {
        if (excluded.has(part)) return false
      }
      if (src.includes('/.yarn/cache/')) return false
      if (src.includes('/scaffold/') && src.endsWith('.gen.ts')) return false
      return true
    },
  })

  const fabricConfigPath = join(workspaceRoot, 'fabric.config.json')
  if (existsSync(fabricConfigPath)) {
    const config = JSON.parse(readFileSync(fabricConfigPath, 'utf8')) as Record<
      string,
      unknown
    >
    if (config.projectId === '__PROJECT_ID__') {
      config.projectId = 'proj-verifier'
      writeFileSync(fabricConfigPath, JSON.stringify(config, null, 2) + '\n')
    }
  }

  const functionsConfigPath = join(
    workspaceRoot,
    'packages',
    'functions',
    'src',
    'config.ts'
  )
  if (existsSync(functionsConfigPath)) {
    const configSource = readFileSync(functionsConfigPath, 'utf8')
    if (!configSource.includes('sqliteDb')) {
      writeFileSync(
        functionsConfigPath,
        configSource.replace(
          'export const createConfig = pikkuConfig(async () => ({',
          "export const createConfig = pikkuConfig(async () => ({\n  dev: { db: true },\n  sqliteDb: '.pikku-runtime/dev.db',"
        )
      )
    }
  }

  return workspaceRoot
}

function runNodeCLI(args: string[], cwd: string): string {
  return execFileSync('node', [PIKKU_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 120_000,
  })
}

function runNativeCLI(args: string[], cwd: string): string {
  return execFileSync(HOST_RELEASE_BINARY, args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 120_000,
  })
}

function installStarterWorkspace(cwd: string): void {
  execFileSync('yarn', ['install', '--mode=skip-build'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 120_000,
  })
}

function prepareStarterWorkspace(cwd: string): void {
  installStarterWorkspace(cwd)
  runNodeCLI(['all'], cwd)
}

rmSync(join(VERIFIER_DIR, 'dist'), { recursive: true, force: true })

await check('pikku binary command is registered (binary --help works)', () => {
  const out = execSync(`node ${PIKKU_BIN} binary --help`, { encoding: 'utf-8' })
  if (!out.includes('compile') && !out.includes('binary')) {
    throw new Error(`"binary" command help not found:\n${out}`)
  }
})

await check('pikku workspace validate command is registered', () => {
  const out = runNodeCLI(['workspace', 'validate', '--help'], VERIFIER_DIR)
  if (!out.includes('workspace') || !out.includes('validate')) {
    throw new Error(`"workspace validate" command help not found:\n${out}`)
  }
})

await check('pikku binary compiles fixture.ts to native binary', () => {
  execSync(`node ${PIKKU_BIN} binary`, {
    cwd: VERIFIER_DIR,
    stdio: 'pipe',
    timeout: 120_000,
  })
  if (!existsSync(BINARY_OUTPUT)) {
    throw new Error(`Expected binary at ${BINARY_OUTPUT} but it does not exist`)
  }
})

await check('compiled binary is executable and prints expected output', () => {
  const out = execFileSync(BINARY_OUTPUT, [], { encoding: 'utf-8' })
  if (!out.includes('hello from pikku binary')) {
    throw new Error(`Unexpected output: ${out}`)
  }
})

await check(
  'pikku binary --compile-target produces a target-suffixed binary',
  () => {
    const platformTarget =
      process.platform === 'darwin' ? 'bun-darwin-arm64' : 'bun-linux-x64'
    execSync(`node ${PIKKU_BIN} binary --compile-target ${platformTarget}`, {
      cwd: VERIFIER_DIR,
      stdio: 'pipe',
      timeout: 120_000,
    })
    const suffix = process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64'
    const targetBin = `${BINARY_OUTPUT}-${suffix}`
    if (!existsSync(targetBin)) {
      throw new Error(
        `Expected target binary at ${targetBin} but it does not exist`
      )
    }
  }
)

await check(
  'source CLI validates and migrates a real starter workspace',
  () => {
    const workspaceRoot = makeStarterWorkspace()
    try {
      prepareStarterWorkspace(workspaceRoot)
      runNodeCLI(['workspace', 'validate'], workspaceRoot)
      runNodeCLI(['fabric', 'validate'], workspaceRoot)
      runNodeCLI(['db', 'migrate'], workspaceRoot)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  },
  {
    skipIf: () =>
      resolveStarterTemplateRoot()
        ? null
        : 'starter template not available in this environment',
  }
)

await check(
  'native release binary runs workspace validate and db migrate on the starter workspace',
  () => {
    const workspaceRoot = makeStarterWorkspace()
    try {
      prepareStarterWorkspace(workspaceRoot)
      runNativeCLI(['workspace', 'validate'], workspaceRoot)
      runNativeCLI(['db', 'migrate'], workspaceRoot)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  },
  {
    skipIf: () => {
      if (!resolveStarterTemplateRoot()) {
        return 'starter template not available in this environment'
      }
      if (!existsSync(HOST_RELEASE_BINARY)) {
        return `host release binary missing at ${HOST_RELEASE_BINARY}`
      }
      return null
    },
  }
)

console.log('='.repeat(60))
console.log('Binary Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  const icon = r.status === 'passed' ? '✓' : r.status === 'skipped' ? '↷' : '✗'
  console.log(`  ${icon} ${r.name}`)
  if (r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
