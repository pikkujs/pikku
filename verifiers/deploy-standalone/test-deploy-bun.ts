/**
 * Offline verifier for the Standalone deploy pipeline — bun runtime.
 *
 * Runs `pikku deploy plan --provider standalone --runtime bun`, asserts the
 * generated entry targets PikkuBunServer (not the node http server), then
 * compiles the bundle into a self-contained executable with
 * `bun build --compile` and hits its endpoints.
 *
 * The compile + runtime checks are skipped (not failed) when `bun` is not on
 * PATH, so the entry-generation assertions still run on a bun-less host.
 */

import { execFileSync, spawn } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs'
import { connect } from 'net'
import { join } from 'path'

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'templates', 'functions')
const REPO_ROOT = join(process.cwd(), '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'standalone')

function hasBun(): boolean {
  try {
    execFileSync('bun', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const BUN_AVAILABLE = hasBun()

console.log(
  'Setting up: running pikku codegen + deploy plan (standalone, bun)...'
)
rmSync(join(FUNCTIONS_DIR, '.deploy'), { recursive: true, force: true })
rmSync(join(FUNCTIONS_DIR, 'src', 'scaffold'), {
  recursive: true,
  force: true,
})
execFileSync('node', [PIKKU_BIN], {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 60_000,
})
execFileSync(
  'node',
  [
    PIKKU_BIN,
    'deploy',
    'plan',
    '--provider',
    'standalone',
    '--runtime',
    'bun',
    '--result-file',
    '.deploy/standalone/plan-result.json',
  ],
  {
    cwd: FUNCTIONS_DIR,
    stdio: 'pipe',
    timeout: 300_000,
  }
)
console.log('Setup complete.\n')

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

await check('exactly 1 unit (singleUnit mode)', () => {
  if (unitDirs.length !== 1)
    throw new Error(
      `Expected 1, got ${unitDirs.length}: ${unitDirs.join(', ')}`
    )
})

// --- Entry targets the bun server, not the node http server ---
await check('entry: PikkuBunServer (not PikkuNodeHTTPServer)', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes('PikkuBunServer'))
    throw new Error(
      'Missing PikkuBunServer — runtime=bun did not switch server'
    )
  if (e.includes('PikkuNodeHTTPServer'))
    throw new Error('Unexpected PikkuNodeHTTPServer in bun entry')
})
await check("entry: imports '@pikku/bun-server'", () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes("from '@pikku/bun-server'"))
    throw new Error('Missing @pikku/bun-server import')
})
await check('entry: no node ws wiring (native bun websockets)', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (e.includes("from 'ws'") || e.includes('WebSocketServer'))
    throw new Error('bun entry should not wire the node ws package')
})
await check('entry: bootstrap import + main()', () => {
  const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
  if (!e.includes('pikku-bootstrap.gen')) throw new Error('Missing bootstrap')
  if (!e.includes('async function main')) throw new Error('Missing main()')
  if (!e.includes('enableExitOnSignals'))
    throw new Error('Missing graceful shutdown')
})

// ---------------------------------------------------------------------------
// Compile to a single executable with bun, then hit endpoints.
// ---------------------------------------------------------------------------

const port = 4098
// Probe over loopback; binding stays 0.0.0.0 (HOST below) but fetching
// 0.0.0.0 as a client target is unreliable on macOS/Windows.
const clientHost = '127.0.0.1'
const binaryPath = join(DEPLOY_DIR, unitName, 'server')

let serverProc: ReturnType<typeof spawn> | null = null

async function startBinary(): Promise<void> {
  const proc = spawn(binaryPath, [], {
    env: { ...process.env, PORT: String(port), HOST: '0.0.0.0' },
    stdio: 'pipe',
    cwd: join(DEPLOY_DIR, unitName),
  })
  // Track immediately so cleanup can always kill it, even on a start timeout.
  serverProc = proc

  let stderr = ''
  proc.stderr?.on('data', (d) => {
    stderr += d.toString()
  })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(
        new Error(
          `Binary start timeout (10s)${stderr ? `: ${stderr.trim().split('\n').slice(-1)[0]}` : ''}`
        )
      )
    }, 10000)
    proc.on('exit', (code) => {
      clearInterval(interval)
      clearTimeout(timeout)
      reject(
        new Error(
          `Binary exited early (code ${code})${stderr ? `: ${stderr.trim().split('\n').slice(-1)[0]}` : ''}`
        )
      )
    })
    // Readiness = the server is listening (any HTTP response), independent of
    // auth/DB so the probe doesn't hang when a request happens to 500.
    const interval = setInterval(async () => {
      try {
        await fetch(`http://${clientHost}:${port}/todos`)
        clearInterval(interval)
        clearTimeout(timeout)
        resolve()
      } catch {
        /* not listening yet */
      }
    }, 200)
  })
}

if (!BUN_AVAILABLE) {
  console.log('bun not found on PATH — skipping compile + runtime checks.\n')
} else {
  await check('compile: bun build --compile produces an executable', () => {
    execFileSync(
      'bun',
      [
        'build',
        '--compile',
        `--outfile=${binaryPath}`,
        join(DEPLOY_DIR, unitName, 'bundle.js'),
      ],
      { stdio: 'pipe' }
    )
    if (!existsSync(binaryPath)) throw new Error('No binary emitted')
    const s = statSync(binaryPath)
    if (s.size < 1024 * 1024)
      throw new Error(`Binary too small: ${(s.size / 1024).toFixed(0)}KB`)
  })

  if (existsSync(binaryPath)) {
    try {
      await startBinary()

      await check('runtime: GET /todos returns array', async () => {
        const res = await fetch(`http://${clientHost}:${port}/todos`)
        if (!res.ok) throw new Error(`Status ${res.status}`)
        const body = (await res.json()) as Record<string, unknown>
        if (!body.todos)
          throw new Error(`Missing todos: ${JSON.stringify(body)}`)
      })

      await check('runtime: POST /rpc/greet returns greeting', async () => {
        const res = await fetch(`http://${clientHost}:${port}/rpc/greet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rpcName: 'greet',
            data: { name: 'BunVerifier' },
          }),
        })
        if (!res.ok)
          throw new Error(`Status ${res.status}: ${await res.text()}`)
        const body = (await res.json()) as Record<string, unknown>
        if (
          typeof body.message !== 'string' ||
          !body.message.includes('BunVerifier')
        ) {
          throw new Error(`Unexpected response: ${JSON.stringify(body)}`)
        }
      })

      // Cross-transport broadcast: an HTTP request publishes to a topic, and a
      // WebSocket client subscribed to that topic must receive it. This only
      // works if the function-side and bun-server-side event hubs are the SAME
      // instance — i.e. PikkuBunServer received the injected eventHub.
      await check(
        'runtime: WS broadcast — HTTP publish reaches subscribed socket',
        async () => {
          const title = `BUN_BROADCAST_${port}`
          const ws = new WebSocket(`ws://${clientHost}:${port}/`)
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
          try {
            await new Promise<void>((resolve, reject) => {
              const t = setTimeout(
                () => reject(new Error('WS open timeout (5s)')),
                5000
              )
              ws.onopen = () => {
                clearTimeout(t)
                resolve()
              }
              ws.onerror = () => {
                clearTimeout(t)
                reject(new Error('WS connection error'))
              }
            })

            const broadcast = new Promise<void>((resolve, reject) => {
              const t = setTimeout(
                () => reject(new Error('No broadcast received (5s)')),
                5000
              )
              ws.onmessage = (e) => {
                const data = typeof e.data === 'string' ? e.data : ''
                if (data.includes(title)) {
                  clearTimeout(t)
                  resolve()
                }
              }
            })

            // subscribe requires a session on this channel
            ws.send(
              JSON.stringify({
                action: 'auth',
                username: 'demo',
                password: 'test',
              })
            )
            await sleep(300)
            ws.send(
              JSON.stringify({ action: 'subscribe', topic: 'todo-created' })
            )
            await sleep(300)

            const res = await fetch(`http://${clientHost}:${port}/todos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, priority: 'low', tags: [] }),
            })
            if (!res.ok) throw new Error(`POST /todos status ${res.status}`)

            await broadcast
          } finally {
            try {
              ws.close()
            } catch {
              /* ignore */
            }
          }
        }
      )

      // The Upgrade header token is case-insensitive (RFC 6455 §4.2.1). A raw
      // handshake with `Upgrade: WebSocket` must still switch protocols — the
      // ws-library test above only exercises the lowercase form clients send.
      await check(
        'runtime: WS upgrade with capitalized Upgrade header (101)',
        async () => {
          const statusLine = await new Promise<string>((resolve, reject) => {
            const socket = connect(port, clientHost, () => {
              socket.write(
                [
                  'GET / HTTP/1.1',
                  `Host: ${clientHost}:${port}`,
                  'Upgrade: WebSocket',
                  'Connection: Upgrade',
                  'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                  'Sec-WebSocket-Version: 13',
                  '',
                  '',
                ].join('\r\n')
              )
            })
            const timer = setTimeout(() => {
              socket.destroy()
              reject(new Error('Raw upgrade timeout (5s)'))
            }, 5000)
            socket.once('data', (d) => {
              clearTimeout(timer)
              socket.destroy()
              resolve(d.toString().split('\r\n')[0] ?? '')
            })
            socket.once('error', (e) => {
              clearTimeout(timer)
              reject(e)
            })
          })
          if (!statusLine.includes('101')) {
            throw new Error(
              `Expected 101 Switching Protocols, got: ${statusLine}`
            )
          }
        }
      )
    } catch (e) {
      if (!results.some((r) => r.name.startsWith('runtime:'))) {
        failures++
        results.push({
          name: 'runtime: binary start',
          passed: false,
          error: (e as Error).message,
        })
      }
    } finally {
      if (serverProc && serverProc.exitCode === null) {
        serverProc.kill('SIGKILL')
        await new Promise((resolve) => serverProc!.on('close', resolve))
      }
    }
  }
}

// --- Results ---
console.log('='.repeat(60))
console.log('Standalone Deploy Verifier Results (bun runtime)')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
