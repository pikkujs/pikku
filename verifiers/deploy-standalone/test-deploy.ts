/**
 * Offline verifier for Standalone deploy pipeline.
 *
 * Has its own pikku.config.json extending templates/functions.
 * Tests singleUnit mode + actually runs the bundle and hits endpoints.
 */

import { execSync, spawn } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'templates', 'functions')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'standalone')

console.log('Setting up: running pikku codegen + deploy plan (standalone)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync('yarn pikku', { cwd: FUNCTIONS_DIR, stdio: 'pipe', timeout: 60_000 })
execSync('yarn pikku deploy plan --provider standalone', {
  cwd: FUNCTIONS_DIR, stdio: 'pipe', timeout: 300_000,
})
console.log('Setup complete.\n')

function readText(path: string): string { return readFileSync(path, 'utf-8') }
function getUnitDirs(): string[] {
  if (!existsSync(DEPLOY_DIR)) return []
  return readdirSync(DEPLOY_DIR).filter((d) => {
    const p = join(DEPLOY_DIR, d)
    return statSync(p).isDirectory() && existsSync(join(p, 'bundle.js'))
  })
}

let failures = 0
const results: Array<{ name: string; passed: boolean; error?: string }> = []
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    results.push({ name, passed: true })
  } catch (e) {
    failures++
    results.push({ name, passed: false, error: (e as Error).message })
  }
}

const unitDirs = getUnitDirs()
const unitName = unitDirs[0]

// --- Single unit mode ---
check('exactly 1 unit (singleUnit mode)', () => {
  if (unitDirs.length !== 1) throw new Error(`Expected 1, got ${unitDirs.length}: ${unitDirs.join(', ')}`)
})

check('bundle > 100KB and < 10MB', () => {
  const s = statSync(join(DEPLOY_DIR, unitName, 'bundle.js')).size
  if (s < 100 * 1024) throw new Error(`Too small: ${(s / 1024).toFixed(0)}KB`)
  if (s > 10 * 1024 * 1024) throw new Error(`Too large: ${(s / 1024 / 1024).toFixed(1)}MB`)
})

check('bundle is ESM (not CJS require)', () => {
  const b = readText(join(DEPLOY_DIR, unitName, 'bundle.js'))
  // ESM bundles don't use __require for user code (only for node builtins)
  // CJS bundles would have var __commonJS or module.exports throughout
  if (b.includes('module.exports =') && !b.includes('__esm')) {
    throw new Error('Looks like CJS (module.exports found)')
  }
})

// --- Entry content ---
check('entry: PikkuExpressServer', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes('PikkuExpressServer')) throw new Error('Missing PikkuExpressServer')
})
check('entry: InMemorySchedulerService', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes('InMemorySchedulerService')) throw new Error('Missing scheduler')
})
check('entry: bootstrap import', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes('pikku-bootstrap.gen')) throw new Error('Missing bootstrap')
})
check('entry: main() + server.start()', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes('async function main')) throw new Error('Missing main()')
  if (!e.includes('server.start()')) throw new Error('Missing server.start()')
})
check('entry: graceful shutdown', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes('enableExitOnSigInt')) throw new Error('Missing shutdown')
})

// --- No infra ---
check('no infra.json', () => {
  if (existsSync(join(DEPLOY_DIR, 'infra.json'))) throw new Error('Should not exist')
})

// ---------------------------------------------------------------------------
// Runtime test: start bundle, hit endpoints
// ---------------------------------------------------------------------------

const port = 4099

async function startServer(): Promise<ReturnType<typeof spawn>> {
  const proc = spawn('node', [join(DEPLOY_DIR, unitName, 'bundle.js')], {
    env: { ...process.env, PORT: String(port), HOST: '0.0.0.0' },
    stdio: 'pipe',
    cwd: join(DEPLOY_DIR, unitName),
  })

  // Wait for ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout (5s)')), 5000)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://0.0.0.0:${port}/health-check`)
        if (res.ok) { clearInterval(interval); clearTimeout(timeout); resolve() }
      } catch { /* not ready */ }
    }, 200)
  })

  return proc
}

let proc: ReturnType<typeof spawn> | null = null
try {
  proc = await startServer()

  await check('runtime: GET /health-check returns 200', async () => {
    const res = await fetch(`http://0.0.0.0:${port}/health-check`)
    if (!res.ok) throw new Error(`Status ${res.status}`)
  })

  await check('runtime: POST /rpc/greet returns greeting', async () => {
    const res = await fetch(`http://0.0.0.0:${port}/rpc/greet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rpcName: 'greet', data: { name: 'Verifier' } }),
    })
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`)
    const body = await res.json() as Record<string, unknown>
    if (typeof body.message !== 'string' || !body.message.includes('Verifier')) {
      throw new Error(`Unexpected response: ${JSON.stringify(body)}`)
    }
  })

  await check('runtime: GET /todos returns array', async () => {
    const res = await fetch(`http://0.0.0.0:${port}/todos`)
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const body = await res.json() as Record<string, unknown>
    if (!body.todos) throw new Error(`Missing todos: ${JSON.stringify(body)}`)
  })

  await check('runtime: POST /todos creates todo', async () => {
    const res = await fetch(`http://0.0.0.0:${port}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Verifier Test', priority: 'low', tags: ['test'] }),
    })
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`)
  })

} catch (e) {
  // Server failed to start — check already recorded the error
  if (!results.some((r) => r.name.startsWith('runtime:'))) {
    failures++
    results.push({ name: 'runtime: server start', passed: false, error: (e as Error).message })
  }
} finally {
  if (proc) {
    proc.kill('SIGTERM')
    await new Promise((resolve) => proc!.on('close', resolve))
  }
}

// --- Results ---
console.log('='.repeat(60))
console.log('Standalone Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
