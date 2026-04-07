/**
 * Offline verifier for Azure Functions deploy pipeline.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_TEMPLATE = join(process.cwd(), '..', '..', 'templates', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_TEMPLATE, '.deploy', 'azure')

console.log('Setting up: running pikku codegen + deploy plan (azure)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_TEMPLATE, stdio: 'pipe' })
execSync('yarn pikku', { cwd: FUNCTIONS_TEMPLATE, stdio: 'pipe', timeout: 60_000 })
execSync('yarn pikku deploy plan', {
  cwd: FUNCTIONS_TEMPLATE,
  stdio: 'pipe',
  timeout: 300_000,
  env: { ...process.env, PIKKU_DEPLOY_PROVIDER: 'azure' },
})
console.log('Setup complete.\n')

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

check('deploy directory exists', () => {
  if (!existsSync(DEPLOY_DIR)) throw new Error(`${DEPLOY_DIR} not found`)
})

const unitDirs = getUnitDirs()

check('units bundled successfully', () => {
  if (unitDirs.length < 40) throw new Error(`Expected >= 40 units, got ${unitDirs.length}`)
})

check('host.json generated', () => {
  const hostPath = join(DEPLOY_DIR, 'host.json')
  if (!existsSync(hostPath)) throw new Error('host.json not found')
  const content = JSON.parse(readFileSync(hostPath, 'utf-8'))
  if (!content.version) throw new Error('host.json missing version')
})

check('local.settings.json generated', () => {
  const settingsPath = join(DEPLOY_DIR, 'local.settings.json')
  if (!existsSync(settingsPath)) throw new Error('local.settings.json not found')
})

check('infra.json generated', () => {
  const infraPath = join(DEPLOY_DIR, 'infra.json')
  if (!existsSync(infraPath)) throw new Error('infra.json not found')
})

check('no unit exceeds 5MB', () => {
  for (const unit of unitDirs) {
    const size = statSync(join(DEPLOY_DIR, unit, 'bundle.js')).size
    if (size > 5 * 1024 * 1024) throw new Error(`${unit} is ${(size / 1024 / 1024).toFixed(1)}MB`)
  }
})

check('greet unit has entry file', () => {
  const entry = join(DEPLOY_DIR, 'greet', 'entry.ts')
  if (!existsSync(entry)) throw new Error('greet/entry.ts not found')
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
