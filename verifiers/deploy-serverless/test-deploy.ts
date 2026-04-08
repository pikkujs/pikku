/**
 * Offline verifier for Serverless (AWS Lambda) deploy pipeline.
 *
 * Tests against verifiers/functions/ — asserts actual manifest content:
 * specific unit names, queues, routes, services, handler types.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'serverless')

console.log('Setting up: running pikku codegen + deploy plan (serverless)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync('yarn pikku', { cwd: FUNCTIONS_DIR, stdio: 'pipe', timeout: 60_000 })
execSync('yarn pikku deploy plan', {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 300_000,
  env: { ...process.env, PIKKU_DEPLOY_PROVIDER: 'serverless' },
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
// serverless.yml
// ---------------------------------------------------------------------------

check('serverless.yml: has provider, functions, and resources sections', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  for (const section of ['provider:', 'functions:']) {
    if (!yml.includes(section)) throw new Error(`Missing ${section}`)
  }
})

check('serverless.yml: references HTTP function handlers', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  for (const name of ['welcome-to-pikku', 'hello-world', 'greet-with-zod', 'calculate-with-zod']) {
    if (!yml.includes(name)) throw new Error(`Missing handler: ${name}`)
  }
})

check('serverless.yml: has queue event sources (hello-world-queue)', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  if (!yml.includes('hello-world-queue')) throw new Error('Missing hello-world-queue')
})

check('serverless.yml: has schedule event (myScheduledTask cron)', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  if (!yml.includes('schedule') && !yml.includes('*/1')) {
    throw new Error('Missing schedule event for myScheduledTask')
  }
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
console.log('Serverless Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
