import { spawn, type ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverScript = resolve(__dirname, 'server.ts')
const PORTS = [3001, 3002]

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
