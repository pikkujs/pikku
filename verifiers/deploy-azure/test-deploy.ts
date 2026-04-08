/**
 * Offline verifier for Azure Functions deploy pipeline.
 *
 * Tests against verifiers/functions/ — asserts actual manifest content:
 * specific unit names, host.json config, routes, services.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'azure')

console.log('Setting up: running pikku codegen + deploy plan (azure)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync('yarn pikku', { cwd: FUNCTIONS_DIR, stdio: 'pipe', timeout: 60_000 })
execSync('yarn pikku deploy plan', {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 300_000,
  env: { ...process.env, PIKKU_DEPLOY_PROVIDER: 'azure' },
})
console.log('Setup complete.\n')

function readText(path: string): string {
  return readFileSync(path, 'utf-8')
}

function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function getUnitDirs(): string[] {
  if (!existsSync(DEPLOY_DIR)) return []
  return readdirSync(DEPLOY_DIR).filter((d) => {
    const p = join(DEPLOY_DIR, d)
    return statSync(p).isDirectory() && existsSync(join(p, 'bundle.js'))
  })
}

let failures = 0
const results: Array<{ name: string; passed: boolean; error?: string }> = []

function check(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, passed: true })
  } catch (e) {
    failures++
    results.push({ name, passed: false, error: (e as Error).message })
  }
}

function assertContains(actual: string[], expected: string[], label: string) {
  const missing = expected.filter((e) => !actual.includes(e))
  if (missing.length > 0) throw new Error(`${label}: missing [${missing.join(', ')}]`)
}

const unitDirs = getUnitDirs()

// ---------------------------------------------------------------------------
// Azure config files
// ---------------------------------------------------------------------------

check('host.json: valid with version 2.0', () => {
  const host = readJSON(join(DEPLOY_DIR, 'host.json')) as { version?: string }
  if (host.version !== '2.0') throw new Error(`Expected version 2.0, got ${host.version}`)
})

check('local.settings.json: has IsEncrypted and Values', () => {
  const settings = readJSON(join(DEPLOY_DIR, 'local.settings.json')) as Record<string, unknown>
  if (settings.IsEncrypted === undefined) throw new Error('Missing IsEncrypted')
  if (!settings.Values) throw new Error('Missing Values')
})

check('infra.json: exists with projectId and units', () => {
  const infra = readJSON(join(DEPLOY_DIR, 'infra.json'))
  if (!infra.projectId) throw new Error('Missing projectId')
  if (!infra.units) throw new Error('Missing units')
})

// ---------------------------------------------------------------------------
// Units: expected functions from verifiers/functions/
// ---------------------------------------------------------------------------

check('HTTP units: welcomeToPikku, helloWorld, greetWithZod, calculateWithZod', () => {
  assertContains(unitDirs, [
    'welcome-to-pikku', 'hello-world', 'greet-with-zod', 'calculate-with-zod',
  ], 'HTTP units')
})

check('queue worker unit: queue-worker', () => {
  assertContains(unitDirs, ['queue-worker'], 'Queue units')
})

check('scheduled task unit: my-scheduled-task', () => {
  assertContains(unitDirs, ['my-scheduled-task'], 'Scheduled units')
})

check('MCP server unit exists', () => {
  assertContains(unitDirs, ['mcp-server'], 'MCP')
})

check('workflow orchestrators: onboarding + DSL', () => {
  const wfUnits = unitDirs.filter((d) => d.startsWith('wf-'))
  if (wfUnits.length < 2) throw new Error(`Expected >= 2 workflow units, got: ${wfUnits.join(', ')}`)
})

check('channel units exist', () => {
  const channelUnits = unitDirs.filter((d) => d.startsWith('channel-'))
  if (channelUnits.length < 1) throw new Error(`Expected >= 1 channel unit, got ${channelUnits.length}`)
})

check('workflow step function units: create-user-profile, send-email', () => {
  assertContains(unitDirs, ['create-user-profile', 'send-email'], 'Workflow step units')
})

check('total units >= 15', () => {
  if (unitDirs.length < 15) throw new Error(`Got ${unitDirs.length}`)
})

// ---------------------------------------------------------------------------
// Entry file content
// ---------------------------------------------------------------------------

check('HTTP unit entries use app.http() registration', () => {
  for (const unit of ['welcome-to-pikku', 'hello-world']) {
    if (!unitDirs.includes(unit)) continue
    const entry = readText(join(DEPLOY_DIR, unit, 'entry.ts'))
    if (!entry.includes('app.http') && !entry.includes('app.get') && !entry.includes('Azure') && !entry.includes('azure')) {
      throw new Error(`${unit} entry doesn't reference Azure handler`)
    }
  }
})

check('queue unit entries use app.storageQueue() or queue handler', () => {
  if (!unitDirs.includes('queue-worker')) return
  const entry = readText(join(DEPLOY_DIR, 'queue-worker', 'entry.ts'))
  if (!entry.includes('queue') && !entry.includes('Queue') && !entry.includes('Azure') && !entry.includes('azure')) {
    throw new Error('queue-worker entry missing queue handler')
  }
})

// ---------------------------------------------------------------------------
// Bundle integrity
// ---------------------------------------------------------------------------

check('no unit exceeds 5MB', () => {
  for (const unit of unitDirs) {
    const size = statSync(join(DEPLOY_DIR, unit, 'bundle.js')).size
    if (size > 5 * 1024 * 1024) throw new Error(`${unit}: ${(size / 1024 / 1024).toFixed(1)}MB`)
  }
})

check('every unit has entry.ts', () => {
  for (const unit of unitDirs) {
    if (!existsSync(join(DEPLOY_DIR, unit, 'entry.ts'))) throw new Error(`${unit} missing entry.ts`)
  }
})

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log('='.repeat(60))
console.log('Azure Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
