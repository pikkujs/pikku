import { spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      )
    })
  })

/** Loopback only, every protocol but OTLP + SQL-over-HTTP off, no phone-home. */
const config = (
  http: number,
  grpc: number,
  dir: string
) => `enable_telemetry = false
default_timezone = "UTC"
[http]
addr = "127.0.0.1:${http}"
timeout = "0s"
body_limit = "256MB"
enable_cors = false
[grpc]
bind_addr = "127.0.0.1:${grpc}"
[mysql]
enable = false
[postgres]
enable = false
[opentsdb]
enable = false
[influxdb]
enable = false
[jaeger]
enable = false
[prom_store]
enable = false
[otlp]
enable = true
[logging]
dir = "${dir}/log"
level = "warn"
enable_otlp_tracing = false
`

export interface SqlResult {
  columns: string[]
  rows: unknown[][]
}

export interface Greptime {
  /** `http://127.0.0.1:<port>/v1/otlp` */
  otlpEndpoint: string
  sql(query: string, database?: string): Promise<SqlResult>
  stop(): Promise<void>
}

/** Starts a real GreptimeDB standalone from `bin` in a fresh temp directory. */
export const startGreptime = async (bin: string): Promise<Greptime> => {
  if (!existsSync(bin)) throw new Error(`GREPTIME_BIN does not exist: ${bin}`)
  const dir = mkdtempSync(join(tmpdir(), 'pikku-otlp-greptime-'))
  mkdirSync(join(dir, 'data'))
  const http = await freePort()
  const grpc = await freePort()
  writeFileSync(join(dir, 'config.toml'), config(http, grpc, dir), {
    mode: 0o600,
  })
  const child: ChildProcess = spawn(
    bin,
    [
      'standalone',
      'start',
      '-c',
      join(dir, 'config.toml'),
      '--data-home',
      join(dir, 'data'),
    ],
    { stdio: 'ignore', env: { PATH: '', HOME: dir } }
  )
  const base = `http://127.0.0.1:${http}`
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 10_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    rmSync(dir, { recursive: true, force: true })
  }

  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) break
    } catch {}
    if (child.exitCode !== null || Date.now() > deadline) {
      await stop()
      throw new Error('GreptimeDB did not become healthy')
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return {
    otlpEndpoint: `${base}/v1/otlp`,
    stop,
    async sql(query, database = 'public') {
      const response = await fetch(`${base}/v1/sql?db=${database}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ sql: query }),
      })
      const json = (await response.json()) as {
        error?: string
        output?: {
          records?: {
            schema: { column_schemas: { name: string }[] }
            rows: unknown[][]
          }
        }[]
      }
      if (!response.ok || json.error) {
        throw new Error(`SQL failed (${response.status}): ${json.error}`)
      }
      const records = json.output?.[0]?.records
      return {
        columns: records?.schema.column_schemas.map((c) => c.name) ?? [],
        rows: records?.rows ?? [],
      }
    },
  }
}
