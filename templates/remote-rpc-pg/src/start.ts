import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverScript = resolve(__dirname, 'server.ts')
const PORTS = [3001, 3002]

// This secret encrypts the session claim in the remote-RPC token, so anyone
// holding it can mint a token as any user. A fixed literal here would ship that
// power to every deployment of this template, so an unset variable gets a fresh
// random secret instead — shared with the servers spawned below, and gone on
// restart. Set PIKKU_REMOTE_SECRET to a value of your own to keep tokens valid
// across restarts and across separately-started servers.
if (!process.env.PIKKU_REMOTE_SECRET) {
  process.env.PIKKU_REMOTE_SECRET = randomBytes(32).toString('hex')
  console.warn(
    'PIKKU_REMOTE_SECRET is not set — generated an ephemeral one for this run. Set it explicitly before deploying.'
  )
}

function spawnServer(port: number): ChildProcess {
  const child = spawn('tsx', [serverScript], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const prefix = `[server:${port}]`

  child.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().trimEnd().split('\n')) {
      console.log(`${prefix} ${line}`)
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().trimEnd().split('\n')) {
      console.error(`${prefix} ${line}`)
    }
  })

  child.on('exit', (code) => {
    console.log(`${prefix} exited with code ${code}`)
  })

  return child
}

const children = PORTS.map(spawnServer)

function shutdown() {
  for (const child of children) {
    child.kill('SIGTERM')
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log(`Spawned ${children.length} servers on ports: ${PORTS.join(', ')}`)
