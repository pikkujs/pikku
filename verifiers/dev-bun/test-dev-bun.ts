/**
 * Verifier: `pikku dev` auto-selects the bun runtime when the CLI runs under bun.
 *
 * Boots `pikku dev` against templates/functions with the CLI executed by bun
 * (`bun <pikku-bin> dev`), so `typeof Bun !== 'undefined'` inside the command is
 * true. Asserts the dev server reports `pikku-bun-server` (the Bun.serve path)
 * rather than the node http server, and that it actually serves requests.
 *
 * Fail-before: with the node http server hardcoded, the bun marker never
 * appears under bun, so the readiness wait times out.
 *
 * Skipped (not failed) when `bun` is not on PATH.
 */

import { execSync, execFileSync, spawn } from 'child_process'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'templates', 'functions')
const REPO_ROOT = join(process.cwd(), '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const PORT = 4099
const MARKER = 'pikku-bun-server'

function hasBun(): boolean {
  try {
    execFileSync('bun', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

if (!hasBun()) {
  console.log('bun not found on PATH — skipping dev bun-runtime verifier.')
  process.exit(0)
}

console.log('Setting up: pikku codegen for templates/functions...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync(`node ${PIKKU_BIN}`, {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 120_000,
})
console.log('Setup complete.\n')

let serverProc: ReturnType<typeof spawn> | null = null
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

async function bootDev(): Promise<string> {
  const proc = spawn('bun', [PIKKU_BIN, 'dev', '--port', String(PORT)], {
    env: {
      ...process.env,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        'ci-build-only-better-auth-secret-not-real',
    },
    stdio: 'pipe',
    cwd: FUNCTIONS_DIR,
  })
  serverProc = proc

  let output = ''
  proc.stdout?.on('data', (d) => (output += d.toString()))
  proc.stderr?.on('data', (d) => (output += d.toString()))

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(
        new Error(
          `Dev server did not become ready in 90s. Last output:\n${output.trim().split('\n').slice(-8).join('\n')}`
        )
      )
    }, 90_000)
    proc.on('exit', (code) => {
      clearInterval(interval)
      clearTimeout(timeout)
      reject(
        new Error(
          `Dev process exited early (code ${code}). Output:\n${output.trim().split('\n').slice(-8).join('\n')}`
        )
      )
    })
    const interval = setInterval(async () => {
      try {
        await fetch(`http://localhost:${PORT}/todos`)
        clearInterval(interval)
        clearTimeout(timeout)
        resolve()
      } catch {
        /* not listening yet */
      }
    }, 300)
  })

  return output
}

try {
  const output = await bootDev()

  await check('dev selects the bun server (pikku-bun-server marker)', () => {
    if (!output.includes(MARKER)) {
      throw new Error(
        `Expected '${MARKER}' in dev output (bun runtime not selected). Output:\n${output.trim().split('\n').slice(-10).join('\n')}`
      )
    }
  })

  await check('dev does not use the node http server under bun', () => {
    if (output.includes('pikku-node-http-server')) {
      throw new Error('node http server is in use under bun')
    }
  })

  await check('runtime: GET /todos returns todos array', async () => {
    const res = await fetch(`http://localhost:${PORT}/todos`)
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const body = (await res.json()) as Record<string, unknown>
    if (!body.todos) throw new Error(`Missing todos: ${JSON.stringify(body)}`)
  })
} catch (e) {
  failures++
  results.push({
    name: 'dev: boot under bun',
    passed: false,
    error: (e as Error).message,
  })
} finally {
  if (serverProc && serverProc.exitCode === null) {
    serverProc.kill('SIGKILL')
    await new Promise((resolve) => serverProc!.on('close', resolve))
  }
}

console.log('='.repeat(60))
console.log('Dev Server Verifier Results (bun runtime auto-detect)')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
