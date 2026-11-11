/**
 * Verifier for @pikku/addon-greptime: a tiny app opts in with
 * `wireAddon({ package: '@pikku/addon-greptime', contributors: ['greptime'] })`,
 * a real `pikku dev` process provisions the `telemetryStore` service through
 * the contributor, and an HTTP function reads it back, against a real GreptimeDB.
 *
 * The server comes from GREPTIME_BIN (a v1.3.0 `greptime` binary) or PATH.
 * Without one the run-side checks are skipped and the build checks still run.
 * The CLI comes from PIKKU_BIN, default packages/cli/dist/bin/pikku.js.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const HERE = process.cwd()
const PIKKU_BIN =
  process.env.PIKKU_BIN ??
  resolve(HERE, '..', '..', 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const GREPTIME_BIN = process.env.GREPTIME_BIN ?? 'greptime'

let failures = 0
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failures++
    console.log(`  ✗ ${name}\n      ${(error as Error).message}`)
  }
}
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const freePort = (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolvePort(port))
    })
    server.on('error', reject)
  })

const until = async (
  what: string,
  probe: () => Promise<boolean>,
  timeoutMs = 60_000
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`timed out waiting for ${what}`)
}

console.log('\nBuild: the contributor is generated into the app')
rmSync(join(HERE, '.pikku'), { recursive: true, force: true })
execFileSync('node', [PIKKU_BIN, 'all'], {
  cwd: HERE,
  stdio: 'pipe',
  timeout: 300_000,
})
await check('the addon contributor is wired for dev', () => {
  const file = join(
    HERE,
    '.pikku',
    'contributors',
    'pikku-dev-contributors.gen.ts'
  )
  assert(existsSync(file), 'pikku-dev-contributors.gen.ts was not generated')
  const text = readFileSync(file, 'utf8')
  assert(/greptimeTelemetry/.test(text), `no greptime contributor in:\n${text}`)
  assert(/addon-greptime/.test(text), 'not imported from @pikku/addon-greptime')
})

/** Starts `pikku dev`; resolves with the base url once it is ready. */
const startApp = (env: Record<string, string>) =>
  new Promise<{ child: ChildProcess; url: string; output: () => string }>(
    (resolveApp, reject) => {
      const child = spawn('node', [PIKKU_BIN, 'dev', '--port', '0'], {
        cwd: HERE,
        env: { ...process.env, PIKKU_GREPTIME_URL: '', ...env },
        stdio: 'pipe',
      })
      let output = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`not ready in time:\n${output.slice(-2000)}`))
      }, 120_000)
      const collect = (chunk: Buffer) => {
        output += chunk.toString()
        const match = /pikku: ready on (\S+)/.exec(output)
        if (match) {
          clearTimeout(timer)
          resolveApp({
            child,
            url: match[1]!.replace(/\/$/, ''),
            output: () => output,
          })
        }
      }
      child.stdout!.on('data', collect)
      child.stderr!.on('data', collect)
      child.on('exit', (code) => {
        clearTimeout(timer)
        reject(
          new Error(`exited (${code}) before ready:\n${output.slice(-2000)}`)
        )
      })
    }
  )

const stop = (child: ChildProcess) =>
  new Promise<void>((resolveStop) => {
    if (child.exitCode !== null) return resolveStop()
    child.removeAllListeners('exit')
    child.on('exit', () => resolveStop())
    child.kill('SIGINT')
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref()
  })

const refusesToStart = async (
  env: Record<string, string>,
  expected: RegExp
) => {
  try {
    const app = await startApp(env)
    await stop(app.child)
    throw new Error('the app became ready')
  } catch (error) {
    const message = (error as Error).message
    assert(/exited \(\d+\) before ready/.test(message), message)
    assert(expected.test(message), `expected ${expected} in:\n${message}`)
  }
}

console.log('\nRun: fail closed without a usable store')
await check(
  'no PIKKU_GREPTIME_URL: the app does not start, and does not fall back to memory',
  () => refusesToStart({}, /PIKKU_GREPTIME_URL/)
)
await check('a remote host without credentials is refused', () =>
  refusesToStart(
    { PIKKU_GREPTIME_URL: 'http://greptime.invalid:4000' },
    /not this machine/
  )
)
await check(
  'an address nothing listens on stops the start, not the first request',
  async () => {
    const port = await freePort()
    await refusesToStart(
      { PIKKU_GREPTIME_URL: `http://127.0.0.1:${port}` },
      /not reachable|GreptimeDB/
    )
  }
)

await check(
  'a retention setting that is not a number of days is refused at start',
  () =>
    refusesToStart(
      {
        PIKKU_GREPTIME_URL: 'http://127.0.0.1:1',
        PIKKU_GREPTIME_RETENTION_DAYS: 'soon',
      },
      /PIKKU_GREPTIME_RETENTION_DAYS/
    )
)

let greptime: ChildProcess | undefined
const data = mkdtempSync(join(tmpdir(), 'pikku-greptime-verifier-'))
try {
  let greptimeOk = true
  try {
    execFileSync(GREPTIME_BIN, ['--version'], { stdio: 'pipe' })
  } catch {
    greptimeOk = false
  }
  if (!greptimeOk) {
    console.log('\nRun: skipped (no greptime binary; set GREPTIME_BIN)')
  } else {
    console.log('\nRun: a real GreptimeDB and a real pikku dev')
    const http = await freePort()
    const grpc = await freePort()
    const config = join(data, 'config.toml')
    writeFileSync(
      config,
      `enable_telemetry = false
default_timezone = "UTC"
[http]
addr = "127.0.0.1:${http}"
timeout = "0s"
[grpc]
bind_addr = "127.0.0.1:${grpc}"
[mysql]
enable = false
[postgres]
enable = false
[otlp]
enable = true
`
    )
    greptime = spawn(
      GREPTIME_BIN,
      ['standalone', 'start', '-c', config, '--data-home', join(data, 'data')],
      { stdio: 'ignore' }
    )
    await until(
      'greptime /health',
      async () => (await fetch(`http://127.0.0.1:${http}/health`)).ok
    )
    const app = await startApp({
      PIKKU_GREPTIME_URL: `http://127.0.0.1:${http}`,
      PIKKU_GREPTIME_DB: 'verifier',
      PIKKU_GREPTIME_RETENTION_DAYS: '14',
    })
    try {
      await check(
        'the addon is listed as installed with no function of it called',
        async () => {
          const response = await fetch(`${app.url}/installed`)
          const body = (await response.json()) as {
            addons: Array<{ name: string; package: string | null }>
          }
          assert(
            body.addons.some(
              (a) =>
                a.name === 'greptime' && a.package === '@pikku/addon-greptime'
            ),
            JSON.stringify(body)
          )
        }
      )
      await check(
        'the contributor provides a TelemetryStore the app can write to and read from',
        async () => {
          const marker = `verifier-${Date.now()}`
          const response = await fetch(`${app.url}/roundtrip`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body: marker }),
          })
          const body = (await response.json()) as {
            provided: boolean
            bodies: string[]
          }
          assert(
            response.ok,
            `status ${response.status}: ${JSON.stringify(body)}`
          )
          assert(body.provided, 'the app saw no telemetryStore service')
          assert(
            body.bodies.includes(marker),
            `read back ${JSON.stringify(body.bodies)}`
          )
        }
      )
      await check(
        'the database the contributor created holds the row',
        async () => {
          const response = await fetch(
            `http://127.0.0.1:${http}/v1/sql?db=verifier`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                sql: 'SELECT count(*) FROM opentelemetry_logs',
              }),
            }
          )
          const body: any = await response.json()
          assert(
            Number(body.output[0].records.rows[0][0]) >= 1,
            JSON.stringify(body)
          )
        }
      )
    } finally {
      await stop(app.child)
    }
  }
} finally {
  if (greptime?.exitCode === null) {
    greptime.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 1500))
    if (greptime.exitCode === null) greptime.kill('SIGKILL')
  }
  rmSync(data, { recursive: true, force: true })
}

console.log(
  failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`
)
process.exit(failures === 0 ? 0 : 1)
