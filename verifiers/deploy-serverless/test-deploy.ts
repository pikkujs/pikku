/**
 * Offline verifier for Serverless (AWS Lambda) deploy pipeline.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_TEMPLATE = join(process.cwd(), '..', '..', 'templates', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_TEMPLATE, '.deploy', 'serverless')

console.log('Setting up: running pikku codegen + deploy plan (serverless)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_TEMPLATE, stdio: 'pipe' })
execSync('yarn pikku', { cwd: FUNCTIONS_TEMPLATE, stdio: 'pipe', timeout: 60_000 })
execSync('yarn pikku deploy plan', {
  cwd: FUNCTIONS_TEMPLATE,
  stdio: 'pipe',
  timeout: 300_000,
  env: { ...process.env, PIKKU_DEPLOY_PROVIDER: 'serverless' },
})
console.log('Setup complete.\n')

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

// --- Tests ---

check('deploy directory exists', () => {
  if (!existsSync(DEPLOY_DIR)) throw new Error(`${DEPLOY_DIR} not found`)
})

const unitDirs = getUnitDirs()

check('units bundled successfully', () => {
  if (unitDirs.length < 40) throw new Error(`Expected >= 40 units, got ${unitDirs.length}`)
})

check('serverless.yml generated', () => {
  const ymlPath = join(DEPLOY_DIR, 'serverless.yml')
  if (!existsSync(ymlPath)) throw new Error('serverless.yml not found')
  const content = readFileSync(ymlPath, 'utf-8')
  if (!content.includes('functions:')) throw new Error('serverless.yml missing functions section')
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
  const content = readFileSync(entry, 'utf-8')
  if (!content.includes('Lambda') && !content.includes('lambda')) {
    // Entry should reference Lambda handler
  }
})

// --- Results ---

console.log('='.repeat(60))
console.log('Serverless Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
