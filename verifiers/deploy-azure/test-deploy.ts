/**
 * Offline verifier for Azure Functions deploy pipeline.
 *
 * Has its own pikku.config.json extending templates/functions.
 * Runs pikku + deploy plan from this directory, asserts actual content.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'templates', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'azure')

console.log('Setting up: running pikku codegen + deploy plan (azure)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync('yarn pikku', { cwd: FUNCTIONS_DIR, stdio: 'pipe', timeout: 60_000 })
execSync('yarn pikku deploy plan --provider azure', {
  cwd: FUNCTIONS_DIR, stdio: 'pipe', timeout: 300_000,
})
console.log('Setup complete.\n')

function readText(path: string): string { return readFileSync(path, 'utf-8') }
function readJSON(path: string): Record<string, unknown> { return JSON.parse(readText(path)) }
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
  try { fn(); results.push({ name, passed: true }) }
  catch (e) { failures++; results.push({ name, passed: false, error: (e as Error).message }) }
}
function assertContains(actual: string[], expected: string[], label: string) {
  const missing = expected.filter((e) => !actual.includes(e))
  if (missing.length > 0) throw new Error(`${label}: missing [${missing.join(', ')}]`)
}

const unitDirs = getUnitDirs()

// --- Azure config ---
check('host.json: version 2.0', () => {
  const host = readJSON(join(DEPLOY_DIR, 'host.json')) as { version?: string }
  if (host.version !== '2.0') throw new Error(`Version: ${host.version}`)
})
check('local.settings.json: has IsEncrypted + Values', () => {
  const s = readJSON(join(DEPLOY_DIR, 'local.settings.json')) as Record<string, unknown>
  if (s.IsEncrypted === undefined) throw new Error('Missing IsEncrypted')
  if (!s.Values) throw new Error('Missing Values')
})
check('infra.json: has projectId + units', () => {
  const infra = readJSON(join(DEPLOY_DIR, 'infra.json'))
  if (!infra.projectId) throw new Error('Missing projectId')
  if (!infra.units) throw new Error('Missing units')
})

// --- Units ---
check('HTTP units: greet, list-todos, create-todo, update-todo', () => {
  assertContains(unitDirs, ['greet', 'list-todos', 'create-todo', 'update-todo'], 'HTTP')
})
check('queue unit: process-reminder', () => {
  assertContains(unitDirs, ['process-reminder'], 'Queue')
})
check('scheduled units: daily-summary, weekly-cleanup', () => {
  assertContains(unitDirs, ['daily-summary', 'weekly-cleanup'], 'Scheduled')
})
check('MCP server unit', () => {
  assertContains(unitDirs, ['mcp-server'], 'MCP')
})
check('workflow orchestrators (>= 2)', () => {
  const wf = unitDirs.filter((d) => d.startsWith('wf-'))
  if (wf.length < 2) throw new Error(`Got: ${wf.join(', ')}`)
})
check('channel units (>= 1)', () => {
  const ch = unitDirs.filter((d) => d.startsWith('channel-'))
  if (ch.length < 1) throw new Error(`Got ${ch.length}`)
})
check('workflow step units: send-notification, schedule-reminder', () => {
  assertContains(unitDirs, ['send-notification', 'schedule-reminder'], 'Step units')
})
check('total units >= 30', () => {
  if (unitDirs.length < 30) throw new Error(`Got ${unitDirs.length}`)
})

// --- Entry content ---
check('HTTP entries reference Azure handler', () => {
  for (const u of ['greet', 'list-todos']) {
    if (!unitDirs.includes(u)) continue
    const entry = readText(join(DEPLOY_DIR, u, 'entry.ts'))
    if (!entry.includes('app.http') && !entry.includes('Azure') && !entry.includes('azure') && !entry.includes('handler')) {
      throw new Error(`${u} entry missing Azure handler`)
    }
  }
})

// --- Bundles ---
check('no unit exceeds 5MB', () => {
  for (const u of unitDirs) {
    const s = statSync(join(DEPLOY_DIR, u, 'bundle.js')).size
    if (s > 5 * 1024 * 1024) throw new Error(`${u}: ${(s / 1024 / 1024).toFixed(1)}MB`)
  }
})
check('every unit has entry.ts', () => {
  for (const u of unitDirs) {
    if (!existsSync(join(DEPLOY_DIR, u, 'entry.ts'))) throw new Error(`${u} missing entry.ts`)
  }
})

// --- Results ---
console.log('='.repeat(60))
console.log('Azure Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
