/**
 * Offline verifier for Cloudflare deploy pipeline.
 *
 * Runs `pikku deploy plan` against the functions template and asserts:
 * - Manifest: correct units, queues, scheduled tasks, roles
 * - Per-unit codegen: correct requiredSingletonServices
 * - Bundle sizes: tree-shaking effective (no kysely in simple units)
 * - Entry files: sub-path imports, no barrel imports
 * - Infra manifest: D1, queues, cron triggers, service bindings
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { test, describe } from 'node:test'
import * as assert from 'node:assert'

const FUNCTIONS_TEMPLATE = join(process.cwd(), '..', '..', 'templates', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_TEMPLATE, '.deploy', 'cloudflare')

// ---------------------------------------------------------------------------
// Setup: Run pikku + deploy plan on the functions template
// ---------------------------------------------------------------------------

console.log('Setting up: running pikku codegen + deploy plan...')

// Clean previous deploy output
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_TEMPLATE, stdio: 'pipe' })

// Run codegen
execSync('yarn pikku', { cwd: FUNCTIONS_TEMPLATE, stdio: 'pipe', timeout: 60_000 })

// Run deploy plan (builds everything without deploying)
execSync('yarn pikku deploy plan', {
  cwd: FUNCTIONS_TEMPLATE,
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
  return readdirSync(DEPLOY_DIR).filter((d) => {
    const p = join(DEPLOY_DIR, d)
    return statSync(p).isDirectory() && existsSync(join(p, 'bundle.js'))
  })
}

function getBundleSize(unitName: string): number {
  const p = join(DEPLOY_DIR, unitName, 'bundle.js')
  return statSync(p).size
}

function getUnitEntry(unitName: string): string {
  return readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
}

function getUnitServices(unitName: string): Record<string, boolean> {
  const content = readText(
    join(DEPLOY_DIR, unitName, '.pikku', 'pikku-services.gen.ts')
  )
  const match = content.match(
    /export const requiredSingletonServices = \{([^}]+)\}/
  )
  if (!match) return {}
  const services: Record<string, boolean> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/'([^']+)':\s*(true|false)/)
    if (kv) services[kv[1]] = kv[2] === 'true'
  }
  return services
}

function getUnitBootstrap(unitName: string): string {
  return readText(
    join(DEPLOY_DIR, unitName, '.pikku', 'pikku-bootstrap.gen.ts')
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

// --- Manifest ---

const infraPath = join(DEPLOY_DIR, 'infra.json')
const infra = existsSync(infraPath) ? readJSON(infraPath) : null

check('infra.json exists', () => {
  assert.ok(infra, 'infra.json should exist')
})

check('infra.json has units', () => {
  const units = infra!.units as Record<string, unknown>
  assert.ok(Object.keys(units).length >= 40, `Expected >= 40 units, got ${Object.keys(units).length}`)
})

check('infra.json has queues', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  const queues = resources.queues ?? []
  assert.ok(queues.length >= 8, `Expected >= 8 queues, got ${queues.length}`)
})

check('infra.json has D1 database', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  const d1 = resources.d1 ?? []
  assert.ok(d1.length >= 1, `Expected >= 1 D1 database, got ${d1.length}`)
})

check('infra.json has cron triggers', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  const crons = resources.cronTriggers ?? []
  assert.ok(crons.length >= 2, `Expected >= 2 cron triggers, got ${crons.length}`)
})

// --- Units ---

const unitDirs = getUnitDirs()

check('all units bundled successfully', () => {
  assert.ok(unitDirs.length >= 40, `Expected >= 40 bundled units, got ${unitDirs.length}`)
})

// --- Bundle sizes (tree-shaking) ---

check('greet bundle < 500KB (no kysely)', () => {
  const size = getBundleSize('greet')
  assert.ok(size < 500 * 1024, `greet bundle is ${(size / 1024).toFixed(0)}KB, expected < 500KB`)
})

check('workflow orchestrator bundle > 500KB (has kysely)', () => {
  const size = getBundleSize('wf-create-and-notify-workflow')
  assert.ok(size > 500 * 1024, `orchestrator bundle is ${(size / 1024).toFixed(0)}KB, expected > 500KB`)
})

check('no unit exceeds 5MB', () => {
  for (const unit of unitDirs) {
    const size = getBundleSize(unit)
    assert.ok(size < 5 * 1024 * 1024, `${unit} is ${(size / 1024 / 1024).toFixed(1)}MB, exceeds 5MB`)
  }
})

// --- Entry file imports (sub-path, not barrel) ---

check('greet entry uses @pikku/cloudflare/handler (not barrel)', () => {
  const entry = getUnitEntry('greet')
  assert.ok(entry.includes("@pikku/cloudflare/handler"), 'Should import from /handler sub-path')
  assert.ok(!entry.includes("from '@pikku/cloudflare'"), 'Should NOT import from barrel')
})

check('greet entry does NOT import CloudflareWorkflowService', () => {
  const entry = getUnitEntry('greet')
  assert.ok(!entry.includes('CloudflareWorkflowService'), 'Should not import workflow service')
  assert.ok(!entry.includes('CloudflareAIStorageService'), 'Should not import AI storage')
})

check('workflow orchestrator entry imports from @pikku/cloudflare/d1', () => {
  const entry = getUnitEntry('wf-create-and-notify-workflow')
  assert.ok(entry.includes("@pikku/cloudflare/d1"), 'Should import from /d1 sub-path')
  assert.ok(entry.includes('CloudflareWorkflowService'), 'Should import workflow service')
})

// --- Per-unit services ---

check('greet: workflowService=false, queueService=false', () => {
  const services = getUnitServices('greet')
  assert.strictEqual(services.workflowService, false)
  assert.strictEqual(services.queueService, false)
})

check('create-todo (step worker): workflowService=true, queueService=true', () => {
  const services = getUnitServices('create-todo')
  assert.strictEqual(services.workflowService, true, 'Step worker needs workflowService')
  assert.strictEqual(services.queueService, true, 'Step worker needs queueService')
})

check('wf-create-and-notify-workflow: workflowService=true', () => {
  const services = getUnitServices('wf-create-and-notify-workflow')
  assert.strictEqual(services.workflowService, true)
})

// --- Bootstrap correctness ---

check('greet bootstrap has HTTP wirings', () => {
  const bootstrap = getUnitBootstrap('greet')
  assert.ok(bootstrap.includes('http/pikku-http-wirings'), 'Should include HTTP wirings')
})

check('greet bootstrap does NOT have workflow wirings', () => {
  const bootstrap = getUnitBootstrap('greet')
  assert.ok(!bootstrap.includes('workflow/pikku-workflow-wirings'), 'Should not include workflow wirings')
})

check('orchestrator bootstrap has workflow wirings', () => {
  const bootstrap = getUnitBootstrap('wf-create-and-notify-workflow')
  assert.ok(bootstrap.includes('workflow/pikku-workflow-wirings'), 'Should include workflow wirings')
})

// --- Queue meta for step workers ---

check('create-todo unit has wf-step-create-todo queue meta', () => {
  const queueMetaPath = join(
    DEPLOY_DIR, 'create-todo', '.pikku', 'queue',
    'pikku-queue-workers-wirings-meta.gen.json'
  )
  assert.ok(existsSync(queueMetaPath), 'Queue meta JSON should exist')
  const meta = readJSON(queueMetaPath)
  assert.ok('wf-step-create-todo' in meta, 'Should have wf-step-create-todo queue')
})

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60))
console.log('CF Deploy Verifier Results')
console.log('='.repeat(60))

for (const r of results) {
  const icon = r.passed ? '✓' : '✗'
  console.log(`  ${icon} ${r.name}`)
  if (!r.passed && r.error) {
    console.log(`    ${r.error}`)
  }
}

console.log(`\n${results.length} tests, ${failures} failed`)

if (failures > 0) {
  process.exit(1)
}
