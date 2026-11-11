/**
 * Offline verifier for the Standalone deploy pipeline — bun runtime.
 *
 * Runs `pikku deploy plan --provider standalone`, asserts the
 * generated entry targets PikkuBunServer (not the node http server), then
 * compiles the bundle into a self-contained executable with
 * `bun build --compile` and hits its endpoints.
 *
 * The compile + runtime checks are skipped (not failed) when `bun` is not on
 * PATH, so the entry-generation assertions still run on a bun-less host.
 */

import { execFileSync, spawn } from 'child_process'
import { execCli } from '../exec-cli.js'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  symlinkSync,
  statSync,
  rmSync,
} from 'fs'
import { createServer as createHttpServer } from 'http'
import { connect, createServer } from 'net'
import { decodeTraces } from '@pikku/core/testing'
import { join } from 'path'

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (typeof address === 'object' && address) {
        probe.close(() => resolve(address.port))
      } else {
        probe.close(() => reject(new Error('Could not allocate a free port')))
      }
    })
  })
}

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'recipes', 'functions')
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

const CONFIG_FILE = join(FUNCTIONS_DIR, 'pikku.config.json')

/**
 * Every check below names a unit after the function it holds, which only works
 * while a unit holds a single function. The default grouping strategy puts
 * every function that builds the same services in one unit, so this verifier
 * pins one-per-function; how units are partitioned is verifiers/deploy-grouping's
 * subject.
 */
const originalConfig = readFileSync(CONFIG_FILE, 'utf-8')
const restoreConfig = () => writeFileSync(CONFIG_FILE, originalConfig)
process.on('exit', restoreConfig)
process.on('SIGINT', () => {
  restoreConfig()
  process.exit(130)
})
// A signalled exit never emits 'exit', so the restore has to be hung off each
// signal by hand — a killed verifier that skipped it would leave the shared
// template config pinned to 'function' and quietly change what every later
// verifier builds.
process.on('SIGTERM', () => {
  restoreConfig()
  process.exit(143)
})
const pinnedConfig = JSON.parse(originalConfig)
// The project opts in to two contributors of an addon with wireAddon. They are
// registered out of order (`marker-reader` needs what `marker` provides, and
// `marker` needs the entry's own logger), and the addon registers a third the
// project does not opt in to. The shared recipe project is wired for the run
// only: the addon is linked into its node_modules and a wiring file is written
// into src, and both are removed on exit like the pinned config.
const ADDON_DIR = join(process.cwd(), 'contrib-marker')
const ADDON_LINK = join(
  FUNCTIONS_DIR,
  'node_modules',
  '@verifier',
  'contrib-marker'
)
const WIRING_FILE = join(FUNCTIONS_DIR, 'src', 'zz-contributors-wiring.ts')
// The app's own serverLifecycle is swapped for one that logs to the same file
// the contributor hooks log to, so their relative order can be read back from
// the compiled binary. Restored on exit like the config and the wiring.
const LIFECYCLE_FILE = join(FUNCTIONS_DIR, 'src', 'lifecycle.ts')
const originalLifecycle = readFileSync(LIFECYCLE_FILE, 'utf-8')
const unwireContributors = () => {
  rmSync(WIRING_FILE, { force: true })
  rmSync(ADDON_LINK, { force: true })
  writeFileSync(LIFECYCLE_FILE, originalLifecycle)
}
process.on('exit', unwireContributors)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    unwireContributors()
    restoreConfig()
    process.exit(130)
  })
}
execCli(`node ${PIKKU_BIN} all`, {
  cwd: ADDON_DIR,
  stdio: 'pipe',
  timeout: 60_000,
})
mkdirSync(join(FUNCTIONS_DIR, 'node_modules', '@verifier'), { recursive: true })
rmSync(ADDON_LINK, { force: true })
symlinkSync(ADDON_DIR, ADDON_LINK, 'dir')
writeFileSync(
  WIRING_FILE,
  `import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'marker',
  package: '@verifier/contrib-marker',
  contributors: ['lazy-reader', 'marker-reader', 'marker', 'hook-b', 'hook-a'],
})
`
)
writeFileSync(
  LIFECYCLE_FILE,
  `import { appendFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pikkuServerLifecycle } from '#pikku/setup'

const log = (line: string) => {
  const base = process.env.PIKKU_HOOK_LOG
  if (!base) return
  // The contributor hooks write through the content service, which keeps the
  // log at <dir>/private/hooks/<name>; append to that same file.
  const dir = join(dirname(base), 'private', 'hooks')
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, basename(base)), line + '\\n')
}

export const lifecycle = pikkuServerLifecycle({
  beforeStart: (services) =>
    log(
      'app:beforeStart hookB=' +
        ((services as any).hookB ?? 'missing') +
        ' lazy=' +
        ((services as any).lazyReader?.readHookB() ?? 'missing')
    ),
  afterStart: () => log('app:afterStart'),
  beforeStop: () => log('app:beforeStop'),
  afterStop: () => log('app:afterStop'),
})
`
)
pinnedConfig.backends.app.deploy = {
  ...pinnedConfig.backends.app.deploy,
  grouping: { strategy: 'function' },
}
writeFileSync(CONFIG_FILE, JSON.stringify(pinnedConfig, null, 2))

console.log(
  'Setting up: running pikku codegen + deploy plan (standalone, bun)...'
)
rmSync(join(FUNCTIONS_DIR, '.deploy'), { recursive: true, force: true })
rmSync(join(FUNCTIONS_DIR, 'src', 'scaffold'), {
  recursive: true,
  force: true,
})
execCli(`node ${PIKKU_BIN}`, {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 60_000,
})
execCli(
  `node ${PIKKU_BIN} deploy plan --provider standalone --result-file .deploy/standalone/plan-result.json`,
  {
    cwd: FUNCTIONS_DIR,
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
      'Missing PikkuBunServer — the entry does not use the bun server'
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

await check(
  'entry: opted-in contributors run in needs/provides order with runtime services',
  () => {
    const e = readText(join(DEPLOY_DIR, unitName, 'entry.ts'))
    if (
      !/import \{ createPlatformServices \} from '\.\/platform-services\.gen\.js'/.test(
        e
      )
    )
      throw new Error(
        'the entry does not import the generated platform services'
      )
    const generated = readText(
      join(DEPLOY_DIR, unitName, 'platform-services.gen.ts')
    )
    const marker = generated.indexOf('markerDeploy ')
    const reader = generated.indexOf('markerReaderDeploy')
    if (marker < 0 || reader < 0)
      throw new Error('the opted-in contributors were not generated')
    if (!/contributor\d+\.run/.test(generated))
      throw new Error('nothing runs them')
    const order = [...generated.matchAll(/^\s*await contributor(\d+)\.run/gm)]
    const names = [
      ...generated.matchAll(/import \{ (\w+) as contributor(\d+) \}/g),
    ]
    const byIndex = Object.fromEntries(names.map((m) => [m[2], m[1]]))
    const ran = order.map((m) => byIndex[m[1]!])
    if (ran.indexOf('markerDeploy') > ran.indexOf('markerReaderDeploy'))
      throw new Error(
        'marker-reader ran before the marker it needs: ' + ran.join(' -> ')
      )
    if (
      generated.includes('notOptedInDeploy') ||
      generated.includes('NEVER_BUNDLED')
    )
      throw new Error(
        'a contributor the project did not opt in to was generated'
      )
    const call = e.indexOf('await createPlatformServices(process.env')
    if (call < 0 || !/createPlatformServices\([^)]*\{ logger,/.test(e))
      throw new Error(
        'createPlatformServices is not handed the runtime services'
      )
    if (call < e.search(/(const|let) triggerSourceStore/))
      throw new Error('createPlatformServices runs before the runtime is built')
    if (!/\.\.\.platformServices,/.test(e))
      throw new Error(
        'the contributed services are not spread into the singleton services'
      )
  }
)

await check('entry: the adapter widened the platform with the unit', () => {
  const generated = readText(
    join(DEPLOY_DIR, unitName, 'platform-services.gen.ts')
  )
  if (!new RegExp(`"unit":\\{"name":"${unitName}"`).test(generated))
    throw new Error('the platform in the generated file carries no unit')
})

// ---------------------------------------------------------------------------
// Compile to a single executable with bun, then hit endpoints.
// ---------------------------------------------------------------------------

const port = await getFreePort()
// Probe over loopback; binding stays 0.0.0.0 (HOST below) but fetching
// 0.0.0.0 as a client target is unreliable on macOS/Windows.
const clientHost = '127.0.0.1'
const binaryPath = join(DEPLOY_DIR, unitName, 'server')

let serverProc: ReturnType<typeof spawn> | null = null

const HOOK_LOG = join(DEPLOY_DIR, 'hook-order.log')
// The hooks write through the content service: <dir>/private/hooks/<name>.
const HOOK_LOG_FILE = join(DEPLOY_DIR, 'private', 'hooks', 'hook-order.log')
const readHookLog = (): string[] =>
  existsSync(HOOK_LOG_FILE)
    ? readFileSync(HOOK_LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean)
    : []

async function startBinary(): Promise<void> {
  rmSync(HOOK_LOG_FILE, { force: true })
  const proc = spawn(binaryPath, [], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '0.0.0.0',
      PIKKU_HOOK_LOG: HOOK_LOG,
      PIKKU_HOOK_FAIL: '',
    },
    stdio: 'pipe',
    cwd: join(DEPLOY_DIR, unitName),
  })
  // Track immediately so cleanup can always kill it, even on a start timeout.
  serverProc = proc

  // Both streams, and the whole tail rather than one line. A bun crash ends
  // with its own version banner (`Bun v1.4.0 (Linux x64)`), so reporting only
  // the LAST line threw away every crash this check exists to surface and left
  // CI saying nothing but the bun version.
  let stderr = ''
  let stdout = ''
  proc.stderr?.on('data', (d) => {
    stderr += d.toString()
  })
  proc.stdout?.on('data', (d) => {
    stdout += d.toString()
  })
  const output = () => {
    const text = [stderr, stdout]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n')
    if (!text) return ''
    return `:\n${text
      .split('\n')
      .slice(-30)
      .map((l) => `      ${l}`)
      .join('\n')}`
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new Error(`Binary start timeout (10s)${output()}`))
    }, 10000)
    proc.on('exit', (code) => {
      clearInterval(interval)
      clearTimeout(timeout)
      reject(new Error(`Binary exited early (code ${code})${output()}`))
    })
    // Readiness = the server is listening (any HTTP response), independent of
    // auth/DB so the probe doesn't hang when a request happens to 500.
    const interval = setInterval(() => {
      ;(async () => {
        try {
          await fetch(`http://${clientHost}:${port}/todos`)
          clearInterval(interval)
          clearTimeout(timeout)
          resolve()
        } catch {
          /* not listening yet */
        }
      })().catch((error) => {
        console.error(error)
      })
    }, 200)
  })
}

/**
 * Runs the compiled binary with extra env on its own port, until it exits by
 * itself (a startup failure) or, with `stopWithSigterm`, once it is serving
 * and has been sent SIGTERM.
 */
async function runToExit(
  env: Record<string, string>,
  options: { stopWithSigterm?: boolean } = {}
): Promise<{ code: number | null; output: string }> {
  rmSync(HOOK_LOG_FILE, { force: true })
  const ownPort = await getFreePort()
  const proc = spawn(binaryPath, [], {
    env: {
      ...process.env,
      PORT: String(ownPort),
      HOST: '0.0.0.0',
      PIKKU_HOOK_LOG: HOOK_LOG,
      ...env,
    },
    stdio: 'pipe',
    cwd: join(DEPLOY_DIR, unitName),
  })
  let output = ''
  proc.stdout?.on('data', (d) => (output += d.toString()))
  proc.stderr?.on('data', (d) => (output += d.toString()))
  const exited = new Promise<number | null>((resolve) =>
    proc.on('exit', resolve)
  )
  const deadline = setTimeout(() => proc.kill('SIGKILL'), 20_000)
  if (options.stopWithSigterm) {
    for (let i = 0; i < 100 && !readHookLog().includes('app:afterStart'); i++)
      await new Promise((r) => setTimeout(r, 100))
    proc.kill('SIGTERM')
  }
  const code = await exited
  clearTimeout(deadline)
  return { code, output }
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

  await check(
    'bundle: carries the opted-in contributors and only those',
    () => {
      const bundle = readText(join(DEPLOY_DIR, unitName, 'bundle.js'))
      if (!bundle.includes('wireAddon.contributors'))
        throw new Error('the opted-in contributors are not in the bundle')
      if (bundle.includes('NEVER_BUNDLED_MARKER'))
        throw new Error(
          'a contributor the project did not opt in to was bundled'
        )
    }
  )

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

      // Contributor hooks against the app's own serverLifecycle, read from the
      // log both wrote to while the compiled binary was running.
      await check(
        'runtime: contributor start hooks run first, then the app lifecycle, the app sees contributor services, and a run that finished earlier reads a later provider through the live bag',
        async () => {
          for (
            let i = 0;
            i < 50 && !readHookLog().includes('app:afterStart');
            i++
          )
            await new Promise((r) => setTimeout(r, 100))
          const expected = [
            'start:hook-a',
            'start:hook-b',
            'app:beforeStart hookB=a>b lazy=a>b',
            'app:afterStart',
          ]
          if (JSON.stringify(readHookLog()) !== JSON.stringify(expected))
            throw new Error(`got ${JSON.stringify(readHookLog())}`)
        }
      )

      await check(
        'runtime: SIGTERM stops the app first, then the contributors in reverse',
        async () => {
          const proc = serverProc!
          const exited = new Promise<number | null>((resolve) =>
            proc.on('exit', resolve)
          )
          proc.kill('SIGTERM')
          await exited
          const expected = [
            'start:hook-a',
            'start:hook-b',
            'app:beforeStart hookB=a>b lazy=a>b',
            'app:afterStart',
            'app:beforeStop',
            'app:afterStop',
            'stop:hook-b',
            'stop:hook-a',
          ]
          if (JSON.stringify(readHookLog()) !== JSON.stringify(expected))
            throw new Error(`got ${JSON.stringify(readHookLog())}`)
        }
      )

      await check(
        'runtime: a failing onServerStart aborts startup naming the contributor',
        async () => {
          const result = await runToExit({ PIKKU_HOOK_FAIL: 'start:hook-b' })
          if (result.code === 0 || result.code === null)
            throw new Error(`expected a non-zero exit, got ${result.code}`)
          if (
            !/Contributor 'hook-b' failed in onServerStart/.test(result.output)
          )
            throw new Error(
              `error does not name the contributor:\n${result.output}`
            )
          if (
            JSON.stringify(readHookLog()) !==
            JSON.stringify(['start:hook-a', 'start:hook-b'])
          )
            throw new Error(`got ${JSON.stringify(readHookLog())}`)
        }
      )

      await check(
        'runtime: every onServerStop is attempted when one throws',
        async () => {
          const result = await runToExit(
            { PIKKU_HOOK_FAIL: 'stop:hook-b' },
            { stopWithSigterm: true }
          )
          if (
            !/afterStop failed during shutdown[\s\S]*hook-b stop exploded/.test(
              result.output
            )
          )
            throw new Error(`the failure was not reported:\n${result.output}`)
          const log = readHookLog()
          if (
            JSON.stringify(log.slice(-3)) !==
            JSON.stringify(['app:afterStop', 'stop:hook-b', 'stop:hook-a'])
          )
            throw new Error(`got ${JSON.stringify(log)}`)
        }
      )
      // --- runtime telemetry (PIKKU_OTLP_*), against a real OTLP receiver ---
      const receive = async () => {
        const requests: Array<{
          url: string
          headers: Record<string, string | string[] | undefined>
          body: Buffer
        }> = []
        const server = createHttpServer((req, res) => {
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(c))
          req.on('end', () => {
            requests.push({
              url: req.url ?? '',
              headers: req.headers,
              body: Buffer.concat(chunks),
            })
            res.statusCode = 200
            res.end()
          })
        })
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
        const address = server.address() as { port: number }
        return {
          requests,
          endpoint: `http://127.0.0.1:${address.port}/v1/otlp`,
          close: () => new Promise<void>((r) => server.close(() => r())),
        }
      }

      /** Starts the binary on its own port, calls GET /todos, stops it with SIGTERM. */
      const serveOnce = async (env: Record<string, string>) => {
        const ownPort = await getFreePort()
        const proc = spawn(binaryPath, [], {
          env: {
            ...process.env,
            PORT: String(ownPort),
            HOST: '127.0.0.1',
            PIKKU_HOOK_LOG: HOOK_LOG,
            ...env,
          },
          stdio: 'pipe',
          cwd: join(DEPLOY_DIR, unitName),
        })
        const exited = new Promise<number | null>((r) => proc.on('exit', r))
        let ready = false
        for (let i = 0; i < 100 && !ready && proc.exitCode === null; i++) {
          try {
            await fetch(`http://127.0.0.1:${ownPort}/todos`)
            ready = true
          } catch {
            await new Promise((r) => setTimeout(r, 100))
          }
        }
        if (!ready) throw new Error('the binary never started listening')
        await fetch(`http://127.0.0.1:${ownPort}/todos`)
        proc.kill('SIGTERM')
        await exited
      }

      await check(
        'runtime: PIKKU_OTLP_ENDPOINT exports a function span, a log and process metrics; per-signal headers reach only their signal',
        async () => {
          const receiver = await receive()
          try {
            await serveOnce({
              PIKKU_OTLP_ENDPOINT: receiver.endpoint,
              PIKKU_OTLP_HEADERS: 'x-test-all=1',
              PIKKU_OTLP_TRACES_HEADERS: 'x-test-traces=1',
              PIKKU_PROJECT: 'verifier',
              PIKKU_STAGE: 'production',
            })
            const at = (suffix: string) =>
              receiver.requests.filter((r) => r.url.endsWith(suffix))
            const traces = at('/v1/traces')
            const logs = at('/v1/logs')
            const metrics = at('/v1/metrics')
            if (!traces.length) throw new Error('no trace export arrived')
            if (!logs.length) throw new Error('no log export arrived')
            if (!metrics.length) throw new Error('no metric export arrived')
            const decoded = traces.flatMap((r) => decodeTraces(r.body))
            const spans = decoded.flatMap((d) => d.items)
            if (!spans.some((s) => s.name === 'listTodos'))
              throw new Error(
                `no listTodos span in ${JSON.stringify(spans.map((s) => s.name))}`
              )
            const resource = decoded[0]!.resource
            if (
              JSON.stringify(resource['pikku.project']) !==
              '{"string":"verifier"}'
            )
              throw new Error(`resource ${JSON.stringify(resource)}`)
            for (const r of [...traces, ...logs, ...metrics]) {
              if (r.headers['x-test-all'] !== '1')
                throw new Error(`${r.url} lost x-test-all`)
            }
            if (!traces.every((r) => r.headers['x-test-traces'] === '1'))
              throw new Error('traces lost their own header')
            if ([...logs, ...metrics].some((r) => 'x-test-traces' in r.headers))
              throw new Error('the traces-only header leaked to logs/metrics')
          } finally {
            await receiver.close()
          }
        }
      )

      await check(
        'runtime: an unset endpoint, or PIKKU_TELEMETRY=0, opens no connection to the endpoint',
        async () => {
          const receiver = await receive()
          try {
            await serveOnce({})
            await serveOnce({
              PIKKU_TELEMETRY: '0',
              PIKKU_OTLP_ENDPOINT: receiver.endpoint,
            })
            if (receiver.requests.length)
              throw new Error(
                `${receiver.requests.length} request(s) reached the receiver`
              )
          } finally {
            await receiver.close()
          }
        }
      )

      for (const [label, env, message] of [
        [
          'a non-loopback http endpoint',
          { PIKKU_OTLP_ENDPOINT: 'http://telemetry.example.com:4318/v1/otlp' },
          /not a loopback address/,
        ],
        [
          'a remote http endpoint even with PIKKU_OTLP_ALLOW_REMOTE=1',
          {
            PIKKU_OTLP_ENDPOINT: 'http://telemetry.example.com:4318/v1/otlp',
            PIKKU_OTLP_ALLOW_REMOTE: '1',
          },
          /must be https/,
        ],
        [
          'credentials in the endpoint URL',
          { PIKKU_OTLP_ENDPOINT: 'http://user:pw@127.0.0.1:4318/v1/otlp' },
          /must not contain credentials/,
        ],
      ] as const) {
        await check(`runtime: ${label} is refused at boot`, async () => {
          const result = await runToExit({ ...env })
          if (result.code === 0 || result.code === null)
            throw new Error(`expected a non-zero exit, got ${result.code}`)
          if (!message.test(result.output))
            throw new Error(`wrong refusal:\n${result.output}`)
        })
      }
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
