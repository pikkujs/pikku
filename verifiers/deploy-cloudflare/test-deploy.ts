/**
 * Offline verifier for Cloudflare deploy pipeline.
 *
 * Tests against verifiers/functions/ — asserts actual manifest content:
 * specific unit names, queues, routes, services, tree-shaking, entry imports.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', 'functions')
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Infra manifest
// ---------------------------------------------------------------------------

const infra = existsSync(join(DEPLOY_DIR, 'infra.json'))
  ? readJSON(join(DEPLOY_DIR, 'infra.json'))
  : null

check('infra.json: has projectId, units, resources', () => {
  if (!infra) throw new Error('infra.json missing')
  if (!infra.projectId) throw new Error('Missing projectId')
  if (!infra.units) throw new Error('Missing units')
  if (!infra.resources) throw new Error('Missing resources')
})

check('infra.json: has queues for hello-world-queue + workflow queues', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  const queues = resources.queues ?? []
  if (queues.length < 3) throw new Error(`Expected >= 3 queues, got ${queues.length}`)
})

check('infra.json: has D1 database for workflow state', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  const d1 = resources.d1 ?? []
  if (d1.length < 1) throw new Error(`Expected >= 1 D1, got ${d1.length}`)
})

check('infra.json: has cron trigger for myScheduledTask', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  const crons = resources.cronTriggers ?? []
  if (crons.length < 1) throw new Error(`Expected >= 1 cron, got ${crons.length}`)
})

// ---------------------------------------------------------------------------
// Units: expected from verifiers/functions/
// ---------------------------------------------------------------------------

check('HTTP units: welcome-to-pikku, hello-world, greet-with-zod, calculate-with-zod', () => {
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

check('MCP server unit', () => {
  assertContains(unitDirs, ['mcp-server'], 'MCP')
})

check('workflow orchestrators: onboarding + DSL', () => {
  const wfUnits = unitDirs.filter((d) => d.startsWith('wf-'))
  if (wfUnits.length < 2) throw new Error(`Expected >= 2 wf- units, got: ${wfUnits.join(', ')}`)
})

check('channel units exist', () => {
  const ch = unitDirs.filter((d) => d.startsWith('channel-'))
  if (ch.length < 1) throw new Error(`Expected >= 1 channel unit, got ${ch.length}`)
})

check('workflow step units: create-user-profile, send-email', () => {
  assertContains(unitDirs, ['create-user-profile', 'send-email'], 'Workflow step units')
})

check('total units >= 15', () => {
  if (unitDirs.length < 15) throw new Error(`Got ${unitDirs.length}`)
})

// ---------------------------------------------------------------------------
// Tree-shaking: sub-path imports
// ---------------------------------------------------------------------------

check('hello-world entry uses @pikku/cloudflare/handler (not barrel)', () => {
  const entry = readText(join(DEPLOY_DIR, 'hello-world', 'entry.ts'))
  if (!entry.includes('@pikku/cloudflare/handler')) throw new Error('Should use /handler sub-path')
  if (entry.includes("from '@pikku/cloudflare'")) throw new Error('Should NOT use barrel import')
})

check('hello-world entry does NOT import CloudflareWorkflowService', () => {
  const entry = readText(join(DEPLOY_DIR, 'hello-world', 'entry.ts'))
  if (entry.includes('CloudflareWorkflowService')) throw new Error('Should not import workflow service')
})

check('workflow orchestrator entry imports from @pikku/cloudflare/d1', () => {
  const orchUnits = unitDirs.filter((d) => d.startsWith('wf-'))
  if (orchUnits.length === 0) throw new Error('No wf- units')
  const entry = readText(join(DEPLOY_DIR, orchUnits[0], 'entry.ts'))
  if (!entry.includes('@pikku/cloudflare/d1')) throw new Error('Orchestrator should use /d1 sub-path')
})

// ---------------------------------------------------------------------------
// Per-unit services
// ---------------------------------------------------------------------------

check('hello-world: workflowService=false', () => {
  const svc = getUnitServices('hello-world')
  if (svc.workflowService !== false) throw new Error(`workflowService=${svc.workflowService}`)
})

check('workflow step (create-user-profile): workflowService=true, queueService=true', () => {
  const svc = getUnitServices('create-user-profile')
  if (svc.workflowService !== true) throw new Error(`workflowService=${svc.workflowService}`)
  if (svc.queueService !== true) throw new Error(`queueService=${svc.queueService}`)
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
// Deploy target (no serverlessIncompatible = all serverless)
// ---------------------------------------------------------------------------

check('no server container when no serverlessIncompatible configured', () => {
  if (existsSync(join(DEPLOY_DIR, 'server'))) throw new Error('server/ should not exist')
  if (existsSync(join(DEPLOY_DIR, 'server-proxy'))) throw new Error('server-proxy/ should not exist')
})

check('no Dockerfiles in any unit', () => {
  for (const unit of unitDirs) {
    if (existsSync(join(DEPLOY_DIR, unit, 'Dockerfile'))) throw new Error(`${unit} has Dockerfile`)
  }
})

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log('='.repeat(60))
console.log('CF Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
