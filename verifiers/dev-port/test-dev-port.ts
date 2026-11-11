/**
 * Verifier: a project's dev script can be plain `pikku dev`.
 *
 * 1. Without `--port`, `pikku dev` listens on the port in the local
 *    environment's backend url. Booted against recipes/functions through a copy
 *    of its config that adds `environments.local` on PORT.
 *    Fail-before: the server binds 3000 and PORT never answers.
 * 2. An explicit `--port` still wins over the url.
 * 3. Under a Node older than 24 (no `node:sqlite`) the bin re-runs itself on
 *    bun: the server reports `pikku-bun-server`. Runs only when OLD_NODE names
 *    such a node binary (CI images carry one Node), and is reported as skipped
 *    otherwise. Fail-before: the old node dies with ERR_UNKNOWN_BUILTIN_MODULE.
 */

import { execFileSync, spawn } from 'child_process'
import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execCli } from '../exec-cli.js'

const REPO_ROOT = join(process.cwd(), '..', '..')
const FUNCTIONS_DIR = join(REPO_ROOT, 'recipes', 'functions')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const CONFIG = join(FUNCTIONS_DIR, 'pikku.dev-port.config.json')
const PORT = 4097
const EXPLICIT_PORT = 4096

// One root config declares every backend and `extends` is gone, so the test
// config is a copy of the project's own with `environments.local` added.
const projectConfig = JSON.parse(
  readFileSync(join(FUNCTIONS_DIR, 'pikku.config.json'), 'utf-8')
)
writeFileSync(
  CONFIG,
  JSON.stringify({
    ...projectConfig,
    environments: {
      local: { backends: { app: `http://localhost:${PORT}` } },
    },
  })
)

console.log('Setting up: pikku codegen for recipes/functions...')
execCli(`node ${PIKKU_BIN} all -c ${CONFIG}`, {
  cwd: FUNCTIONS_DIR,
  timeout: 120_000,
})
console.log('Setup complete.\n')

let failures = 0
const results: Array<{ name: string; passed: boolean; error?: string }> = []
const record = (name: string, error?: string) => {
  if (error) failures++
  results.push({ name, passed: !error, error })
}

const tail = (output: string) => output.trim().split('\n').slice(-10).join('\n')

/** Boot `pikku dev`, wait for `port` to serve /todos, return its output. */
async function bootDev(
  runtime: string,
  args: string[],
  port: number
): Promise<string> {
  const proc = spawn(runtime, [PIKKU_BIN, 'dev', '-c', CONFIG, ...args], {
    env: {
      ...process.env,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        'ci-build-only-better-auth-secret-not-real',
    },
    stdio: 'pipe',
    cwd: FUNCTIONS_DIR,
    detached: true,
  })
  let output = ''
  proc.stdout?.on('data', (d) => (output += d.toString()))
  proc.stderr?.on('data', (d) => (output += d.toString()))
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval)
        reject(
          new Error(`Nothing served :${port} in 90s. Output:\n${tail(output)}`)
        )
      }, 90_000)
      proc.on('exit', (code) => {
        clearInterval(interval)
        clearTimeout(timeout)
        reject(
          new Error(`pikku dev exited (code ${code}). Output:\n${tail(output)}`)
        )
      })
      const interval = setInterval(() => {
        fetch(`http://localhost:${port}/todos`)
          .then((res) => {
            if (!res.ok) return
            clearInterval(interval)
            clearTimeout(timeout)
            resolve()
          })
          .catch(() => {
            /* not listening yet */
          })
      }, 300)
    })
    return output
  } finally {
    proc.removeAllListeners('exit')
    try {
      process.kill(-proc.pid!, 'SIGKILL')
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
}

const attempt = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn()
    record(name)
  } catch (e) {
    record(name, (e as Error).message)
  }
}

try {
  await attempt(
    "no --port: serves on the local environment's backend url port",
    async () => {
      await bootDev('node', [], PORT)
    }
  )

  await attempt('--port wins over the url', async () => {
    await bootDev('node', ['--port', String(EXPLICIT_PORT)], EXPLICIT_PORT)
  })

  const oldNode = process.env.OLD_NODE
  if (!oldNode) {
    console.log('OLD_NODE not set — skipping the Node <24 bun hand-over check.')
  } else {
    await attempt(
      `Node ${execFileSync(oldNode, ['--version']).toString().trim()} re-runs the CLI on bun`,
      async () => {
        const output = await bootDev(oldNode, [], PORT)
        if (!output.includes('pikku-bun-server')) {
          throw new Error(
            `Expected the bun server after the hand-over. Output:\n${tail(output)}`
          )
        }
      }
    )
  }
} finally {
  rmSync(CONFIG, { force: true })
}

console.log('='.repeat(60))
console.log('Dev Port Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
