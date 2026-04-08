/**
 * Offline verifier for Cloudflare deploy pipeline.
 *
 * Has its own pikku.config.json extending templates/functions.
 * Runs pikku + deploy plan from this directory, asserts actual content.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'templates', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'cloudflare')

console.log('Setting up: running pikku codegen + deploy plan (cloudflare)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync('yarn pikku', { cwd: FUNCTIONS_DIR, stdio: 'pipe', timeout: 60_000 })
execSync('yarn pikku deploy plan', {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 300_000,
  env: { ...process.env, PIKKU_DEPLOY_PROVIDER: 'cloudflare' },
})
console.log('Setup complete.\n')

function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'))
}
function readText(path: string): string {
  return readFileSync(path, 'utf-8')
}
function getUnitDirs(): string[] {
  if (!existsSync(DEPLOY_DIR)) return []
  return readdirSync(DEPLOY_DIR).filter((d) => {
    const p = join(DEPLOY_DIR, d)
    return statSync(p).isDirectory() && existsSync(join(p, 'bundle.js'))
  })
}
function getUnitServices(unitName: string): Record<string, boolean> {
  const path = join(DEPLOY_DIR, unitName, '.pikku', 'pikku-services.gen.ts')
  if (!existsSync(path)) return {}
  const content = readText(path)
  const match = content.match(/export const requiredSingletonServices = \{([^}]+)\}/)
  if (!match) return {}
  const services: Record<string, boolean> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/'([^']+)':\s*(true|false)/)
    if (kv) services[kv[1]] = kv[2] === 'true'
  }
  return services
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
const infra = existsSync(join(DEPLOY_DIR, 'infra.json')) ? readJSON(join(DEPLOY_DIR, 'infra.json')) : null

// --- Infra manifest ---
check('infra.json: has projectId, units, resources', () => {
  if (!infra) throw new Error('infra.json missing')
  if (!infra.projectId) throw new Error('Missing projectId')
  if (!infra.units) throw new Error('Missing units')
  if (!infra.resources) throw new Error('Missing resources')
})
check('infra.json: has queues (todo-reminders + workflow)', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  if ((resources.queues ?? []).length < 3) throw new Error(`Expected >= 3 queues`)
})
check('infra.json: has D1 database', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  if ((resources.d1 ?? []).length < 1) throw new Error('Missing D1')
})
check('infra.json: has cron triggers', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  if ((resources.cronTriggers ?? []).length < 1) throw new Error('Missing crons')
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
check('workflow step units: create-todo, send-notification, schedule-reminder', () => {
  // These are function units that also consume workflow step queues
  assertContains(unitDirs, ['send-notification', 'schedule-reminder'], 'Step units')
})
check('total units >= 30', () => {
  if (unitDirs.length < 30) throw new Error(`Got ${unitDirs.length}`)
})

// --- Tree-shaking ---
check('greet entry uses @pikku/cloudflare/handler (not barrel)', () => {
  const entry = readText(join(DEPLOY_DIR, 'greet', 'entry.ts'))
  if (!entry.includes('@pikku/cloudflare/handler')) throw new Error('Missing /handler')
  if (entry.includes("from '@pikku/cloudflare'")) throw new Error('Uses barrel')
})
check('greet entry: no CloudflareWorkflowService', () => {
  const entry = readText(join(DEPLOY_DIR, 'greet', 'entry.ts'))
  if (entry.includes('CloudflareWorkflowService')) throw new Error('Should not import workflow')
})
check('orchestrator entry uses @pikku/cloudflare/d1', () => {
  const wf = unitDirs.filter((d) => d.startsWith('wf-'))
  const entry = readText(join(DEPLOY_DIR, wf[0], 'entry.ts'))
  if (!entry.includes('@pikku/cloudflare/d1')) throw new Error('Missing /d1')
})

// --- Services ---
check('greet: workflowService=false', () => {
  const svc = getUnitServices('greet')
  if (svc.workflowService !== false) throw new Error(`Got ${svc.workflowService}`)
})
check('create-todo (step worker): workflowService=true, queueService=true', () => {
  const svc = getUnitServices('create-todo')
  if (svc.workflowService !== true) throw new Error(`workflowService=${svc.workflowService}`)
  if (svc.queueService !== true) throw new Error(`queueService=${svc.queueService}`)
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

// --- No server container ---
check('no server container (no serverlessIncompatible)', () => {
  if (existsSync(join(DEPLOY_DIR, 'server'))) throw new Error('server/ exists')
  if (existsSync(join(DEPLOY_DIR, 'server-proxy'))) throw new Error('server-proxy/ exists')
})
check('no Dockerfiles', () => {
  for (const u of unitDirs) {
    if (existsSync(join(DEPLOY_DIR, u, 'Dockerfile'))) throw new Error(`${u} has Dockerfile`)
  }
})

// --- Results ---
console.log('='.repeat(60))
console.log('CF Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
